import { Inject, Injectable } from "@nestjs/common";
import { decide, isSerious, type TurnKind } from "../domain/conversation/correction-policy.js";
import { type FluencySignals, fluencySignals, type SessionTiming } from "../domain/conversation/fluency.js";
import type { Mode } from "../domain/conversation/mode.js";
import type { Session } from "../domain/conversation/types.js";
import { LEARNER_CONTEXT_PORT, type LearnerContextPort } from "../domain/ports/learner-context.port.js";
import { MISTAKE_REPOSITORY, type MistakeRepository, type SessionMistake } from "../domain/ports/mistake.repository.js";
import {
  type ConfidenceMoment,
  SESSION_REPOSITORY,
  type SessionOutcome,
  type SessionRepository,
} from "../domain/ports/session.repository.js";
import { TUTOR_PORT, type TutorPort } from "../domain/ports/tutor.port.js";

/** How many of the learner's most frequent mistakes the tutor watches for. */
export const KNOWN_MISTAKES_LIMIT = 20;

/** Speech-to-text output varies in case and end punctuation; ignore both when matching. */
function sameText(a: string, b: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[.,!?;:]+$/, "");
  return normalize(a) === normalize(b);
}

export class SessionNotFoundError extends Error {}
export class SessionEndedError extends Error {}

export interface TurnResult {
  kind: TurnKind;
  message: string;
  selfCorrected: boolean;
}

export interface SessionSummary {
  sessionId: string;
  mode: Mode;
  mistakes: SessionMistake[];
  selfCorrections: number;
  signals: FluencySignals;
  confidence: SessionOutcome["confidence"];
}

@Injectable()
export class ConversationService {
  constructor(
    @Inject(TUTOR_PORT) private readonly tutor: TutorPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(MISTAKE_REPOSITORY) private readonly mistakes: MistakeRepository,
    @Inject(LEARNER_CONTEXT_PORT) private readonly learnerContext: LearnerContextPort,
  ) {}

  async start(mode: Mode, language: string): Promise<{ session: Session; message: string }> {
    const session = await this.sessions.create({ mode, language });
    const message = await this.tutor.open({ mode, language, learnerContext: await this.learnerContext.load() });
    await this.sessions.appendTurn(session.id, { role: "assistant", content: message });
    return { session, message };
  }

  async respond(sessionId: string, utterance: string): Promise<TurnResult> {
    const session = await this.openSession(sessionId);
    const [history, known, learnerContext] = await Promise.all([
      this.sessions.history(sessionId),
      this.mistakes.mostFrequent(session.language, KNOWN_MISTAKES_LIMIT),
      this.learnerContext.load(),
    ]);

    const verdict = await this.tutor.evaluate({
      mode: session.mode,
      language: session.language,
      learnerContext,
      history,
      pending: session.pending,
      knownMistakes: known.map(({ original, correction, category }) => ({ original, correction, category })),
      utterance,
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
      const mistake = known.find((m) => sameText(m.original, used));
      if (!mistake || (pending && sameText(mistake.original, pending.original))) continue;
      await this.mistakes.recordCorrectUse(sessionId, { language: session.language, original: mistake.original });
    }
    if (decision.selfCorrected && pending) {
      await this.mistakes.markSelfCorrected(sessionId, { language: session.language, original: pending.original });
    }

    await this.sessions.appendTurn(sessionId, { role: "user", content: utterance });
    await this.sessions.appendTurn(sessionId, { role: "assistant", content: decision.message });
    await this.sessions.setPending(sessionId, decision.nextPending);

    return { kind: decision.kind, message: decision.message, selfCorrected: decision.selfCorrected };
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
        mistakes,
        learnerUtterances: history.filter((t) => t.role === "user").map((t) => t.content),
        timing: outcome?.timing ?? null,
      }),
      confidence: outcome?.confidence ?? { before: null, after: null },
    };
  }

  /** How ready the learner feels for this meeting type, 1–5. Allowed after the end: "after" is asked then. */
  async rateConfidence(sessionId: string, moment: ConfidenceMoment, value: number): Promise<void> {
    if (!Number.isInteger(value) || value < 1 || value > 5) throw new RangeError("Confidence goes from 1 to 5.");
    const session = await this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    await this.sessions.setConfidence(sessionId, moment, value);
  }

  private async openSession(sessionId: string): Promise<Session> {
    const session = await this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    if (session.endedAt) throw new SessionEndedError(sessionId);
    return session;
  }
}
