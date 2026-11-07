import { Inject, Injectable } from "@nestjs/common";
import { decide, notedOnly, type TurnKind, verdictForMode } from "../domain/conversation/correction-policy.js";
import {
  givesWords,
  nextGoalAfter,
  openingPlan,
  pausesForHints,
  resolveTrackTurn,
  startTrack,
  type TrackOutcomes,
  trackOutcomes,
  type TrackView,
  trackView,
  turnPlan,
  usesTrack,
} from "../domain/conversation/guided-track.js";
import { fluencySignals, type SessionTiming } from "../domain/conversation/fluency.js";
import { correctsMistakes, type Mode } from "../domain/conversation/mode.js";
import {
  checkInDue,
  checkInLine,
  describeGoal,
  GOAL_DESCRIPTIONS,
  goalsFor,
  mergeCovered,
} from "../domain/conversation/session-goals.js";
import { keptScaffold, sessionStep, wasAssisted } from "../domain/conversation/support.js";
import { type ChatTurn, NEW_WORD_CATEGORY, type PracticeTarget, type Session } from "../domain/conversation/types.js";
import { choosePracticeTargets, metTargetsAfter } from "../domain/conversation/practice-targets.js";
import { sameText, safeSupport } from "../domain/conversation/text.js";
import { DomainError } from "../domain/errors.js";
import type { SpeakingLevel } from "../domain/level/speaking-level.js";
import { type SessionSignals, unaidedShare } from "../domain/progress/signal-trend.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { MISTAKE_BANK_REPOSITORY, type MistakeBankRepository } from "../domain/ports/mistake-bank.repository.js";
import { LEARNER_CONTEXT_PORT, type LearnerContextPort } from "../domain/ports/learner-context.port.js";
import { LEVEL_ASSESSOR_PORT, type LevelAssessorPort } from "../domain/ports/level-assessor.port.js";
import { LEVEL_REPOSITORY, type LevelRepository } from "../domain/ports/level.repository.js";
import { MISTAKE_REPOSITORY, type MistakeRepository, type SessionMistake } from "../domain/ports/mistake.repository.js";
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from "../domain/ports/session.repository.js";
import { type TutorContext, TUTOR_PORT, type TutorPort } from "../domain/ports/tutor.port.js";
import { recordTurnLearning } from "./turn-learning.js";

/** How many of the learner's most frequent mistakes the tutor watches for. */
export const KNOWN_MISTAKES_LIMIT = 20;

export class SessionNotFoundError extends DomainError {
  readonly code = "not_found";

  constructor(sessionId: string) {
    super(`Session ${sessionId} not found.`, "Session not found.");
  }
}

export class SessionEndedError extends DomainError {
  readonly code = "ended";

  constructor(sessionId: string) {
    super(`Session ${sessionId} has ended.`, "This session has ended.");
  }
}

export interface TurnResult {
  kind: TurnKind;
  message: string;
  selfCorrected: boolean;
  /** Written help in the learner's first language, shown on screen only. */
  support: string | null;
  /** On a hint: the learner's words that hold the mistake, so the screen can point at them. Never the correction. */
  mistake: string | null;
  /** True when the tutor asked whether to stop or keep going. */
  checkIn: boolean;
  /** Goals of the mode the learner has covered so far. */
  coveredGoals: string[];
  /** Where the learner is in the guided track (A1–A2), or null. */
  track: TrackView | null;
  /** Words the tutor gave for the next turn (a model sentence, or a sentence start when stuck), or null. */
  scaffold: string | null;
}

export interface SessionStart {
  session: Session;
  message: string;
  goals: readonly string[];
}

/** What the app needs to pick an open session up again, e.g. after the page reloads. */
export interface SessionResume {
  sessionId: string;
  mode: Mode;
  language: string;
  startedAt: Date;
  /** The conversation so far, in order. */
  turns: ChatTurn[];
  goals: readonly string[];
  coveredGoals: string[];
  /** The serious mistake the conversation is paused on, without its correction (the hints must not give it away). */
  hint: { hintsGiven: number; revealed: boolean; mistake: string } | null;
  track: TrackView | null;
  scaffold: string | null;
}

export interface SessionSummary {
  sessionId: string;
  mode: Mode;
  language: string;
  mistakes: SessionMistake[];
  selfCorrections: number;
  signals: SessionSignals;
  goals: { id: string; covered: boolean }[];
  /** The mistakes practiced in this session; `met` when the learner said the correct form. */
  targets: (PracticeTarget & { met: boolean })[];
  /** After a placement interview: the level it gave, or null when the learner said nothing. Null in other modes. */
  level: SpeakingLevel | null;
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
    @Inject(LEVEL_ASSESSOR_PORT) private readonly assessor: LevelAssessorPort,
    @Inject(LEVEL_REPOSITORY) private readonly levels: LevelRepository,
  ) {}

  async start(mode: Mode, language: string): Promise<SessionStart> {
    const [targets, level] = await Promise.all([
      correctsMistakes(mode) ? this.bank.list(language).then(choosePracticeTargets) : [],
      this.levels.current(language),
    ]);
    const step = sessionStep(mode, level?.level ?? null);
    const track = startTrack(step, goalsFor(mode)[0] ?? null);
    const created = await this.sessions.create({ mode, language, startedAt: this.clock.now(), targets, step, track });
    const plan = track ? openingPlan(track, describeGoal) : null;
    const opening = await this.tutor.open(this.tutorContext(created, await this.learnerContext.load()), plan);
    await this.sessions.appendTurn(created.id, { role: "assistant", content: opening.line });
    // In the guided track the opening already gives the first model sentence.
    const scaffold = track && givesWords(track.stage) ? opening.scaffold : null;
    const session = { ...created, scaffold };
    if (scaffold) {
      await this.sessions.setProgress(created.id, {
        coveredGoals: [],
        lastCheckInAt: null,
        metTargets: [],
        scaffold,
        step,
        track,
      });
    }
    return { session, message: opening.line, goals: goalsFor(mode) };
  }

  /** The state of an open session, so the learner can go on where they left off. */
  async resume(sessionId: string): Promise<SessionResume> {
    const session = await this.openSession(sessionId);
    const turns = await this.sessions.history(sessionId);
    const { pending } = session;
    return {
      sessionId: session.id,
      mode: session.mode,
      language: session.language,
      startedAt: session.startedAt,
      turns,
      goals: goalsFor(session.mode),
      coveredGoals: session.coveredGoals,
      hint: pending ? { hintsGiven: pending.hintsGiven, revealed: pending.revealed, mistake: pending.original } : null,
      track: trackView(session.track),
      scaffold: session.scaffold,
    };
  }

  /**
   * The tutor's answer to one learner turn.
   *
   * With `onReply`, the tutor's reply is handed over as soon as it is written, before the mistakes are
   * analysed, so it can be spoken at once. The returned result is then what follows the reply: its
   * message is the hint or the stop-or-keep-going question, or "" when there is nothing more to say.
   * While a hint is pending the reply may not be said, so the answer always comes in one piece.
   */
  async respond(sessionId: string, utterance: string, onReply?: (reply: TurnResult) => void): Promise<TurnResult> {
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
    const outcomes = this.trackOutcomes(session, utterance);
    const early = { reply: null as string | null };
    const handOver =
      onReply && !session.pending
        ? (reply: string) => {
            early.reply = reply;
            onReply({
              kind: "reply",
              message: reply,
              selfCorrected: false,
              support: null,
              mistake: null,
              checkIn: false,
              coveredGoals: session.coveredGoals,
              // The track moves once the turn is analysed; the follow-up carries where it went.
              track: trackView(session.track),
              scaffold: session.scaffold,
            });
          }
        : undefined;
    const verdict = await this.tutor.evaluate(
      {
        ...this.tutorContext(session, learnerContext),
        history,
        pending: session.pending,
        knownMistakes: watched,
        knownNewWords: knownNewWords.map(toKnown),
        utterance,
        coveredGoals: session.coveredGoals,
        scaffold: session.scaffold,
        plan: outcomes && session.track ? turnPlan(session.track, outcomes, describeGoal) : null,
      },
      handOver,
    );
    // The placement interview only observes: every mistake is recorded as minor, so none stops it with a hint.
    // In the guided track, saying the words given (the model, the longer sentence) never stops for a hint either.
    const byMode = verdictForMode(session.mode, verdict);
    const observed = session.track && !pausesForHints(session.track.stage) ? notedOnly(byMode) : byMode;
    const decision = decide(session.pending, observed);
    // The track moves on a plain reply only: while a hint is pending, the learner retries the same answer.
    const inTrack =
      outcomes && session.track
        ? resolveTrackTurn({ track: session.track, outcomes, replied: decision.kind === "reply", verdict })
        : null;
    const move = inTrack?.move ?? null;

    const pending = session.pending;
    await recordTurnLearning(this.mistakes, {
      sessionId,
      language: session.language,
      pending,
      issues: byMode.issues,
      verdict,
      watched: [...known, ...session.targets],
      selfCorrected: decision.selfCorrected,
    });

    // Goals and the stop-or-keep-going question, only on a turn where the conversation goes on.
    // In the guided track a goal is covered by the learner's own answer, not by repeating the words given.
    const coveredGoals = mergeCovered(session.mode, session.coveredGoals, inTrack?.reportedGoals ?? verdict.coveredGoals);
    const metTargets = metTargetsAfter({
      targets: session.targets,
      alreadyMet: session.metTargets,
      correctUses: verdict.correctUses,
      pending,
    });
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
    const question = checkIn ? checkInLine(checkIn, session.language) : null;
    // Without a pending hint the decision is a reply or a hint: after a reply already said, only the hint is new.
    const message =
      early.reply !== null
        ? decision.kind === "hint"
          ? decision.message
          : (question ?? "")
        : [decision.message, question].filter(Boolean).join(" ");
    const said = early.reply !== null ? [early.reply, message].filter(Boolean).join(" ") : message;

    const assisted = wasAssisted({ scaffoldBefore: session.scaffold, usedFirstLanguage: verdict.newWords.length > 0 });
    // Words to say only come with a plain reply: a hint or the correct form asks for the learner's own sentence.
    const scaffold = inTrack ? inTrack.scaffold : decision.kind === "reply" ? keptScaffold(session.step, verdict) : null;
    await this.sessions.appendTurn(sessionId, { role: "user", content: utterance, assisted });
    await this.sessions.appendTurn(sessionId, { role: "assistant", content: said });
    await this.sessions.setPending(sessionId, decision.nextPending);
    await this.sessions.setProgress(sessionId, {
      coveredGoals,
      lastCheckInAt: checkIn ? now : session.lastCheckInAt,
      metTargets,
      scaffold,
      step: move?.step ?? session.step,
      track: move?.track ?? session.track,
    });

    return {
      kind: decision.kind,
      message,
      selfCorrected: decision.selfCorrected,
      support: safeSupport(verdict.support, decision.nextPending?.correction),
      mistake: decision.kind === "hint" ? (decision.nextPending?.original ?? null) : null,
      checkIn: checkIn !== null,
      coveredGoals,
      track: trackView(move?.track ?? session.track),
      scaffold,
    };
  }

  /** Ends the session (once: ending it again keeps the first timing) and returns its summary. */
  async end(sessionId: string, timing: SessionTiming | null = null): Promise<SessionSummary> {
    const session = await this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    const history = await this.sessions.history(sessionId);
    let level: SpeakingLevel | null = null;
    if (session.mode === "placement") {
      // Assessed before the session is marked ended: if the tutor is down, ending again retries it.
      level = (await this.levels.forSession(sessionId)) ?? (session.endedAt ? null : await this.assessPlacement(session, history));
    }
    if (!session.endedAt) await this.sessions.end(sessionId, timing);
    const [mistakes, outcome] = await Promise.all([
      this.mistakes.forSession(sessionId),
      this.sessions.outcome(sessionId),
    ]);
    return {
      sessionId,
      mode: session.mode,
      language: session.language,
      mistakes,
      selfCorrections: mistakes.filter((m) => m.selfCorrected).length,
      signals: {
        ...fluencySignals({
          // New words are not mistakes.
          mistakes: mistakes.filter((m) => m.category !== NEW_WORD_CATEGORY),
          learnerUtterances: history.filter((t) => t.role === "user").map((t) => t.content),
          timing: outcome?.timing ?? null,
        }),
        unaidedShare: unaidedShare(outcome?.learnerTurns ?? { total: 0, assisted: 0 }),
      },
      goals: goalsFor(session.mode).map((id) => ({ id, covered: session.coveredGoals.includes(id) })),
      targets: session.targets.map((t) => ({ ...t, met: session.metTargets.includes(t.original) })),
      level,
    };
  }

  /** Estimates and stores the level from the interview. No level when the learner said nothing. */
  private async assessPlacement(session: Session, history: ChatTurn[]): Promise<SpeakingLevel | null> {
    if (!history.some((t) => t.role === "user")) return null;
    const { level, evidence } = await this.assessor.assess({ language: session.language, turns: history });
    const placed: SpeakingLevel = {
      language: session.language,
      level,
      source: "placement",
      evidence,
      assessedAt: this.clock.now(),
    };
    // Two ends at once can both assess; the session still keeps one level.
    return this.levels.addForSession(session.id, placed);
  }

  /** In the guided track, the two ways this turn can move it (stuck or not), so the tutor can follow either. */
  private trackOutcomes(session: Session, utterance: string): TrackOutcomes | null {
    const { track, step } = session;
    if (!track || !usesTrack(step)) return null;
    const nextGoal = nextGoalAfter(goalsFor(session.mode), track.goal, session.coveredGoals);
    return trackOutcomes({ track, step, model: session.scaffold, utterance, nextGoal });
  }

  private tutorContext(session: Session, learnerContext: string): TutorContext {
    return {
      mode: session.mode,
      language: session.language,
      learnerContext,
      goals: goalsFor(session.mode).map((id) => ({ id, description: GOAL_DESCRIPTIONS[id] })),
      targets: session.targets,
      step: session.step,
    };
  }

  private async openSession(sessionId: string): Promise<Session> {
    const session = await this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    if (session.endedAt) throw new SessionEndedError(sessionId);
    return session;
  }
}

