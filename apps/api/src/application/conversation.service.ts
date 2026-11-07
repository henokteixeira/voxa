import { Inject, Injectable } from "@nestjs/common";
import { decide, isSerious, type TurnKind } from "../domain/conversation/correction-policy.js";
import { type FluencySignals, fluencySignals, type SessionTiming } from "../domain/conversation/fluency.js";
import type { Mode } from "../domain/conversation/mode.js";
import {
  checkInDue,
  checkInLine,
  GOAL_DESCRIPTIONS,
  goalsFor,
  mergeCovered,
} from "../domain/conversation/session-goals.js";
import { NEW_WORD_CATEGORY, type PracticeTarget, type Session } from "../domain/conversation/types.js";
import { mistakeStatus } from "../domain/mistakes/mistake-status.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { MISTAKE_BANK_REPOSITORY, type MistakeBankRepository } from "../domain/ports/mistake-bank.repository.js";
import { LEARNER_CONTEXT_PORT, type LearnerContextPort } from "../domain/ports/learner-context.port.js";
import { MISTAKE_REPOSITORY, type MistakeRepository, type SessionMistake } from "../domain/ports/mistake.repository.js";
import {
  type ConfidenceMoment,
  SESSION_REPOSITORY,
  type SessionOutcome,
  type SessionRepository,
} from "../domain/ports/session.repository.js";
import { type TutorContext, TUTOR_PORT, type TutorPort } from "../domain/ports/tutor.port.js";

/** How many of the learner's most frequent mistakes the tutor watches for. */
export const KNOWN_MISTAKES_LIMIT = 20;
/** How many mistakes from the bank each session practices. */
export const PRACTICE_TARGETS = 2;

/** Speech-to-text output varies in case and end punctuation; ignore both when matching. */
export function sameText(a: string, b: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[.,!?;:]+$/, "");
  return normalize(a) === normalize(b);
}

/** On-screen help must not give away the correction the learner is working on. */
export function safeSupport(support: string | null, correction: string | undefined): string | null {
  const text = support?.trim() ?? "";
  if (!text) return null;
  if (correction && text.toLowerCase().includes(correction.trim().toLowerCase())) return null;
  return text;
}

export class SessionNotFoundError extends Error {}
export class SessionEndedError extends Error {}

export interface TurnResult {
  kind: TurnKind;
  message: string;
  selfCorrected: boolean;
  /** Written help in the learner's first language, shown on screen only. */
  support: string | null;
  /** True when the tutor asked whether to stop or keep going. */
  checkIn: boolean;
  /** Goals of the mode the learner has covered so far. */
  coveredGoals: string[];
}

export interface SessionStart {
  session: Session;
  message: string;
  goals: readonly string[];
}

export interface SessionSummary {
  sessionId: string;
  mode: Mode;
  mistakes: SessionMistake[];
  selfCorrections: number;
  signals: FluencySignals;
  confidence: SessionOutcome["confidence"];
  goals: { id: string; covered: boolean }[];
  /** The mistakes practiced in this session; `met` when the learner said the correct form. */
  targets: (PracticeTarget & { met: boolean })[];
}

@Injectable()
export class ConversationService {
  constructor(
    @Inject(TUTOR_PORT) private readonly tutor: TutorPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(MISTAKE_REPOSITORY) private readonly mistakes: MistakeRepository,
    @Inject(LEARNER_CONTEXT_PORT) private readonly learnerContext: LearnerContextPort,
    @Inject(MISTAKE_BANK_REPOSITORY) private readonly bank: Pick<MistakeBankRepository, "list">,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async start(mode: Mode, language: string): Promise<SessionStart> {
    const targets = await this.pickTargets(language);
    const session = await this.sessions.create({ mode, language, startedAt: this.clock.now(), targets });
    const message = await this.tutor.open(this.tutorContext(session, await this.learnerContext.load()));
    await this.sessions.appendTurn(session.id, { role: "assistant", content: message });
    return { session, message, goals: goalsFor(mode) };
  }

  async respond(sessionId: string, utterance: string): Promise<TurnResult> {
    const session = await this.openSession(sessionId);
    const [history, known, learnerContext] = await Promise.all([
      this.sessions.history(sessionId),
      // Twice the limit, so new words don't push real mistakes out of the list.
      this.mistakes.mostFrequent(session.language, KNOWN_MISTAKES_LIMIT * 2),
      this.learnerContext.load(),
    ]);

    const toKnown = ({ original, correction, category }: PracticeTarget) => ({ original, correction, category });
    const knownMistakes = known.filter((m) => m.category !== NEW_WORD_CATEGORY).slice(0, KNOWN_MISTAKES_LIMIT);
    const knownNewWords = known.filter((m) => m.category === NEW_WORD_CATEGORY).slice(0, KNOWN_MISTAKES_LIMIT);
    // The tutor watches the practice targets too, so a correct use of one is reported.
    const watched = [
      ...knownMistakes.map(toKnown),
      ...session.targets.filter((t) => !knownMistakes.some((m) => sameText(m.original, t.original))),
    ];
    const verdict = await this.tutor.evaluate({
      ...this.tutorContext(session, learnerContext),
      history,
      pending: session.pending,
      knownMistakes: watched,
      knownNewWords: knownNewWords.map(toKnown),
      utterance,
      coveredGoals: session.coveredGoals,
    });
    const decision = decide(session.pending, verdict);

    // Every mistake goes to the bank, except a retry of the one already pending.
    const pending = session.pending;
    for (const issue of verdict.issues) {
      if (pending && (sameText(issue.correction, pending.correction) || sameText(issue.original, pending.original))) {
        continue;
      }
      await this.mistakes.record(
        { language: session.language, original: issue.original, correction: issue.correction, category: issue.category },
        { sessionId, severity: isSerious(issue) ? "serious" : "minor" },
      );
    }
    // Correct uses of known mistakes, except the retry of the pending one (that came after a hint).
    for (const used of verdict.correctUses) {
      const mistake = [...known, ...session.targets].find((m) => sameText(m.original, used));
      if (!mistake || (pending && sameText(mistake.original, pending.original))) continue;
      await this.mistakes.recordCorrectUse(sessionId, { language: session.language, original: mistake.original });
    }
    // A new word is never a mistake: skip one the tutor also listed as an issue, the pending one, or a repeat.
    const taken = [...verdict.issues.map((i) => i.original), ...(pending ? [pending.original] : [])];
    for (const word of verdict.newWords) {
      if (taken.some((t) => sameText(t, word.said))) continue;
      taken.push(word.said);
      await this.mistakes.record(
        { language: session.language, original: word.said, correction: word.words, category: NEW_WORD_CATEGORY },
        { sessionId, severity: "minor" },
      );
    }
    if (decision.selfCorrected && pending) {
      await this.mistakes.markSelfCorrected(sessionId, { language: session.language, original: pending.original });
    }

    // Goals and the stop-or-keep-going question, only on a turn where the conversation goes on.
    const coveredGoals = mergeCovered(session.mode, session.coveredGoals, verdict.coveredGoals);
    // A target is met by the correct form said without a hint, even if the mistake also came up this session.
    const metTargets = session.targets
      .map((t) => t.original)
      .filter(
        (original) =>
          session.metTargets.includes(original) ||
          (verdict.correctUses.some((u) => sameText(u, original)) && !(pending && sameText(pending.original, original))),
      );
    const now = this.clock.now();
    const checkIn =
      decision.kind === "reply"
        ? checkInDue({
            mode: session.mode,
            coveredBefore: session.coveredGoals,
            covered: coveredGoals,
            elapsedMs: now.getTime() - session.startedAt.getTime(),
            lastCheckInMs: session.lastCheckInAt ? session.lastCheckInAt.getTime() - session.startedAt.getTime() : null,
          })
        : null;
    const message = checkIn ? `${decision.message} ${checkInLine(checkIn, session.language)}` : decision.message;

    await this.sessions.appendTurn(sessionId, { role: "user", content: utterance });
    await this.sessions.appendTurn(sessionId, { role: "assistant", content: message });
    await this.sessions.setPending(sessionId, decision.nextPending);
    await this.sessions.setProgress(sessionId, {
      coveredGoals,
      lastCheckInAt: checkIn ? now : session.lastCheckInAt,
      metTargets,
    });

    return {
      kind: decision.kind,
      message,
      selfCorrected: decision.selfCorrected,
      support: safeSupport(verdict.support, decision.nextPending?.correction),
      checkIn: checkIn !== null,
      coveredGoals,
    };
  }

  /** Ends the session (once: ending it again keeps the first timing) and returns its summary. */
  async end(sessionId: string, timing: SessionTiming | null = null): Promise<SessionSummary> {
    const session = await this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    if (!session.endedAt) await this.sessions.end(sessionId, timing);
    const [mistakes, history, outcome] = await Promise.all([
      this.mistakes.forSession(sessionId),
      this.sessions.history(sessionId),
      this.sessions.outcome(sessionId),
    ]);
    return {
      sessionId,
      mode: session.mode,
      mistakes,
      selfCorrections: mistakes.filter((m) => m.selfCorrected).length,
      signals: fluencySignals({
        // New words are not mistakes.
        mistakes: mistakes.filter((m) => m.category !== NEW_WORD_CATEGORY),
        learnerUtterances: history.filter((t) => t.role === "user").map((t) => t.content),
        timing: outcome?.timing ?? null,
      }),
      confidence: outcome?.confidence ?? { before: null, after: null },
      goals: goalsFor(session.mode).map((id) => ({ id, covered: session.coveredGoals.includes(id) })),
      targets: session.targets.map((t) => ({ ...t, met: session.metTargets.includes(t.original) })),
    };
  }

  /** How ready the learner feels for this meeting type, 1–5. Allowed after the end: "after" is asked then. */
  async rateConfidence(sessionId: string, moment: ConfidenceMoment, value: number): Promise<void> {
    if (!Number.isInteger(value) || value < 1 || value > 5) throw new RangeError("Confidence goes from 1 to 5.");
    const session = await this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    await this.sessions.setConfidence(sessionId, moment, value);
  }

  /** The most frequent mistakes the learner has not mastered yet. New words are not mistakes. */
  private async pickTargets(language: string): Promise<PracticeTarget[]> {
    const entries = await this.bank.list(language);
    return entries
      .filter((m) => m.category !== NEW_WORD_CATEGORY && mistakeStatus(m.sessionsCorrect) !== "mastered")
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, PRACTICE_TARGETS)
      .map(({ original, correction, category }) => ({ original, correction, category }));
  }

  private tutorContext(session: Session, learnerContext: string): TutorContext {
    return {
      mode: session.mode,
      language: session.language,
      learnerContext,
      goals: goalsFor(session.mode).map((id) => ({ id, description: GOAL_DESCRIPTIONS[id] })),
      targets: session.targets,
    };
  }

  private async openSession(sessionId: string): Promise<Session> {
    const session = await this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    if (session.endedAt) throw new SessionEndedError(sessionId);
    return session;
  }
}
