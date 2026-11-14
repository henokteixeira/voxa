import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  decide,
  focusedVerdict,
  pausingPatterns,
  type TurnKind,
  type TutorVerdict,
  verdictForMode,
} from "../domain/conversation/correction-policy.js";
import {
  nextGoalAfter,
  resolveTrackTurn,
  type TrackOutcomes,
  trackOutcomes,
  type TrackView,
  trackView,
  turnPlan,
} from "../domain/conversation/guided-track.js";
import { correctsMistakes } from "../domain/conversation/mode.js";
import { checkInDue, checkInLine, describeGoal, goalsFor, mergeCovered } from "../domain/conversation/session-goals.js";
import { SessionEndedError, TurnConflictError } from "../domain/conversation/session-errors.js";
import { keptScaffold, surprisesAllowed, wasAssisted } from "../domain/conversation/support.js";
import { NEW_WORD_CATEGORY, type PracticeTarget, type Session } from "../domain/conversation/types.js";
import { hintFocus, metTargetsAfter } from "../domain/conversation/practice-targets.js";
import { sameText, safeSupport, shownRule } from "../domain/conversation/text.js";
import { patternsToBringBack } from "../domain/mistakes/bring-back.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { LEARNER_CONTEXT_PORT, type LearnerContextPort } from "../domain/ports/learner-context.port.js";
import { MISSION_REPOSITORY, type MissionRepository } from "../domain/ports/mission.repository.js";
import { MISTAKE_BANK_REPOSITORY, type MistakeBankRepository } from "../domain/ports/mistake-bank.repository.js";
import { MISTAKE_REPOSITORY, type MistakeRepository } from "../domain/ports/mistake.repository.js";
import { SESSION_REPOSITORY, type SessionRepository } from "../domain/ports/session.repository.js";
import { type SentenceHelp, TUTOR_PORT, type TutorPort, type TutorRequest } from "../domain/ports/tutor.port.js";
import { InvalidInputError } from "../domain/errors.js";
import { UNIT_OF_WORK, type TransactionStores, type UnitOfWork } from "../domain/ports/unit-of-work.port.js";
import { ReviewScheduler } from "./review-scheduler.js";
import { openSession, phrasesOf, tutorContext } from "./session-context.js";
import { recordTurnLearning } from "./turn-learning.js";

/** How many of the learner's most frequent mistakes the tutor watches for. */
export const KNOWN_MISTAKES_LIMIT = 20;
/** How many of the bank's patterns the tutor sees, so a mistake that breaks one of them reuses its key. */
export const KNOWN_PATTERNS_LIMIT = 30;

export interface TurnResult {
  kind: TurnKind;
  message: string;
  selfCorrected: boolean;
  /** Written help in the learner's first language, shown on screen only. */
  support: string | null;
  /** On a hint: the learner's words that hold the mistake, so the screen can point at them. Never the correction. */
  mistake: string | null;
  /** On a hint or the correct form: the mistake's type (e.g. verb_tense), named on the card. */
  mistakeType: string | null;
  /** With a hint or the correct form: the rule the mistake breaks, in one line (see shownRule). */
  rule: { name: string; rule: string } | null;
  /** True when the tutor asked whether to stop or keep going. */
  checkIn: boolean;
  /** Goals of the mode the learner has covered so far. */
  coveredGoals: string[];
  /** Where the learner is in the step-by-step script (A1–B1), or null. */
  track: TrackView | null;
  /** Words the tutor gave for the next turn (the script's words, or a sentence start when stuck), or null. */
  scaffold: string | null;
  /** Key words shown with a sentence to complete; empty otherwise. */
  keyWords: string[];
}

/** One learner turn: the tutor's answer, what the turn taught, and the session's progress, saved together. */
@Injectable()
export class TurnService {
  private readonly logger = new Logger(TurnService.name);

  constructor(
    @Inject(TUTOR_PORT) private readonly tutor: Pick<TutorPort, "evaluate" | "help">,
    @Inject(SESSION_REPOSITORY) private readonly sessions: Pick<SessionRepository, "get" | "history" | "outcome">,
    @Inject(MISTAKE_REPOSITORY) private readonly mistakes: Pick<MistakeRepository, "mostFrequent" | "patterns" | "sessionPatterns">,
    @Inject(LEARNER_CONTEXT_PORT) private readonly learnerContext: LearnerContextPort,
    @Inject(MISTAKE_BANK_REPOSITORY) private readonly bank: Pick<MistakeBankRepository, "list">,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly reviews: ReviewScheduler,
    @Inject(MISSION_REPOSITORY) private readonly missions: Pick<MissionRepository, "get">,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {}

  /**
   * The tutor's answer to one learner turn.
   *
   * With `onReply`, the tutor's reply is handed over as soon as it is written, before the mistakes are
   * analysed, so it can be spoken at once. The returned result is then what follows the reply: its
   * message is the hint or the stop-or-keep-going question, or "" when there is nothing more to say.
   * While a hint is pending the reply may not be said, so the answer always comes in one piece.
   */
  async respond(sessionId: string, utterance: string, onReply?: (reply: TurnResult) => void): Promise<TurnResult> {
    const session = await openSession(this.sessions, sessionId);
    const corrects = correctsMistakes(session.mode);
    const turnAt = this.clock.now();
    const [history, known, knownPatterns, sessionPatterns, learnerContext, mission, entries, duePatterns, dueExpressions, outcome] = await Promise.all([
      this.sessions.history(sessionId),
      // Twice the limit, so new words don't push real mistakes out of the list.
      this.mistakes.mostFrequent(session.language, KNOWN_MISTAKES_LIMIT * 2),
      this.mistakes.patterns(session.language, KNOWN_PATTERNS_LIMIT),
      corrects ? this.mistakes.sessionPatterns(sessionId) : [],
      this.learnerContext.load(),
      session.missionId ? this.missions.get(session.missionId) : null,
      corrects ? this.bank.list(session.language) : [],
      corrects ? this.reviews.duePatterns(session.language, turnAt) : new Set<string>(),
      corrects ? this.reviews.dueExpressions(session.language, turnAt) : [],
      this.sessions.outcome(sessionId),
    ]);
    const learnerTurn = history.filter((t) => t.role === "user").length + 1;

    const toKnown = ({ original, correction, category }: PracticeTarget) => ({ original, correction, category });
    const knownMistakes = known.filter((m) => m.category !== NEW_WORD_CATEGORY).slice(0, KNOWN_MISTAKES_LIMIT);
    const knownNewWords = known.filter((m) => m.category === NEW_WORD_CATEGORY).slice(0, KNOWN_MISTAKES_LIMIT);
    // The tutor watches the practice targets too, so a correct use of one is reported.
    const watched = [
      ...knownMistakes.map(toKnown),
      ...session.targets.filter((t) => !knownMistakes.some((m) => sameText(m.original, t.original))),
    ];
    const focus = hintFocus({ entries, duePatterns, targets: session.targets, sessionPatterns });
    const goals = goalsFor(session.mode);
    const outcomes = this.trackOutcomes(session);
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
              mistakeType: null,
              rule: null,
              checkIn: false,
              coveredGoals: session.coveredGoals,
              // The script moves once the turn is analysed; the follow-up carries where it went.
              track: trackView(session.track, goals),
              scaffold: session.scaffold,
              keyWords: session.keyWords,
            });
          }
        : undefined;
    const request: TutorRequest = {
      ...tutorContext(session, learnerContext, phrasesOf(mission)),
      history,
      pending: session.pending,
      knownMistakes: watched,
      knownNewWords: knownNewWords.map(toKnown),
      knownPatterns,
      // The reply asks for the learner's next turn. Not while a hint is pending or the script gives the
      // next line: the reply has another job then.
      bringBack: session.pending || session.track ? [] : patternsToBringBack(sessionPatterns, learnerTurn + 1),
      focusPatterns: pausingPatterns(focus),
      reviewExpressions: dueExpressions.map((e) => e.phrase),
      utterance,
      coveredGoals: session.coveredGoals,
      scaffold: session.scaffold,
      plan: outcomes ? turnPlan(outcomes, describeGoal, phrasesOf(mission)) : null,
      // The script asks its own questions: no surprises while it runs.
      surprises: !session.track && surprisesAllowed(session.step, outcome?.learnerTurns ?? { total: 0, assisted: 0 }),
    };
    let verdict: TutorVerdict;
    try {
      verdict = await this.tutor.evaluate(request, handOver);
    } catch (error) {
      // The reply may already be on its way to the learner's ears: keep it, so the conversation goes on from it.
      if (early.reply !== null) await this.keepSpokenReply(session, history.length, utterance, early.reply);
      throw error;
    }
    // The placement interview only observes: every mistake is recorded as minor, so none stops it with a hint.
    // A mistake the learner said they said right is not raised again in this session, nor recorded.
    const kept = withoutWithdrawn(verdict, session.withdrawnMistakes);
    const byMode = verdictForMode(session.mode, focusedVerdict(kept, focus));
    const decision = decide(session.pending, byMode);
    // The script moves on a plain reply only: while a hint is pending, the learner retries the same answer.
    const inTrack = outcomes
      ? resolveTrackTurn({
          outcomes,
          replied: decision.kind === "reply",
          verdict: { stuck: verdict.stuck, scaffold: verdict.scaffold, keyWords: verdict.keyWords ?? [] },
        })
      : null;
    const move = inTrack?.move ?? null;

    const pending = session.pending;
    const now = this.clock.now();
    const learning = {
      sessionId,
      language: session.language,
      pending,
      issues: byMode.issues,
      verdict,
      watched: [...known, ...session.targets],
      // Words the tutor gave may hold an expression: saying them back is not recalling it.
      dueExpressions: session.scaffold === null ? dueExpressions : [],
      selfCorrected: decision.selfCorrected,
      learnerTurn,
      now,
    };

    // Goals and the stop-or-keep-going question, only on a turn where the conversation goes on.
    // In the script a goal is covered by its step answered without being stuck.
    const reported = inTrack ? (inTrack.move?.covered ? [inTrack.move.covered] : []) : verdict.coveredGoals;
    const coveredGoals = mergeCovered(session.mode, session.coveredGoals, reported);
    // The script asks to put it all together before the stop-or-keep-going question, and asks it once that is said.
    const retelling = move?.track?.stage === "retell";
    const scriptDone = session.track?.stage === "retell" && move !== null && move.track === null;
    const metTargets = metTargetsAfter({
      targets: session.targets,
      alreadyMet: session.metTargets,
      correctUses: verdict.correctUses,
      pending,
    });
    const checkIn = scriptDone
      ? "goals_met"
      : decision.kind === "reply" && !retelling
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
    // In the script the step gives them (none on the turn that ends it); outside it, a sentence start when stuck.
    const scaffold = inTrack ? inTrack.scaffold : decision.kind === "reply" ? keptScaffold(session.step, verdict) : null;
    const keyWords = inTrack?.keyWords ?? [];
    // Everything the turn changes is saved together: a failure halfway leaves no mistake counted for a turn that was never saved.
    try {
      await this.saveTurn(sessionId, history.length, async (stores) => {
        await recordTurnLearning(stores.mistakes, new ReviewScheduler(stores.reviews), learning);
        await stores.sessions.appendTurn(sessionId, { role: "user", content: utterance, assisted });
        await stores.sessions.appendTurn(sessionId, { role: "assistant", content: said });
        await stores.sessions.setPending(sessionId, decision.nextPending);
        await stores.sessions.setProgress(sessionId, {
          coveredGoals,
          lastCheckInAt: checkIn ? now : session.lastCheckInAt,
          metTargets,
          scaffold,
          keyWords,
          step: session.step,
          track: move ? move.track : session.track,
        });
      });
    } catch (error) {
      // Saving failed after the reply was spoken: keep at least the reply. Not after a conflict or an end, which won.
      const lost = !(error instanceof TurnConflictError || error instanceof SessionEndedError);
      if (lost && early.reply !== null) await this.keepSpokenReply(session, history.length, utterance, early.reply);
      throw error;
    }

    return {
      kind: decision.kind,
      message,
      selfCorrected: decision.selfCorrected,
      support: safeSupport(verdict.support, decision.nextPending?.correction),
      mistake: decision.kind === "hint" ? (decision.nextPending?.original ?? null) : null,
      mistakeType: decision.kind === "reply" ? null : (decision.nextPending?.category ?? null),
      rule: decision.kind === "reply" ? null : shownRule(decision.nextPending),
      checkIn: checkIn !== null,
      coveredGoals,
      track: trackView(move ? move.track : session.track, goals),
      scaffold,
      keyWords,
    };
  }

  /**
   * "Help me" (2026-11-13): the start of a sentence and key words for the learner's next answer. They become the words
   * given, so the next answer counts as helped and the tutor reads it as finishing them.
   */
  async help(sessionId: string): Promise<SentenceHelp> {
    const session = await openSession(this.sessions, sessionId);
    if (!correctsMistakes(session.mode)) throw new InvalidInputError("The placement interview gives no help with what to say.");
    // A hint asks for the learner's own sentence, and a script step with words on screen already gives them.
    if (session.pending) throw new InvalidInputError("No help with what to say while a hint is pending.");
    if (session.track && session.scaffold) throw new InvalidInputError("The script already gives the words to say.");
    const [history, learnerContext, mission] = await Promise.all([
      this.sessions.history(sessionId),
      this.learnerContext.load(),
      session.missionId ? this.missions.get(session.missionId) : null,
    ]);
    const help = await this.tutor.help(tutorContext(session, learnerContext, phrasesOf(mission)), history);
    // Only while the learner has not answered meanwhile: then the help was for a line already past.
    await this.saveTurn(sessionId, history.length, ({ sessions }) => sessions.setScaffold(sessionId, help.start));
    return help;
  }

  /**
   * "I said it right": the learner says the tutor (or the speech-to-text) got the pending mistake wrong. The mistake no
   * longer counts for this session and the conversation goes on, with no more hints about it. Nothing to do without one.
   */
  async withdrawPending(sessionId: string): Promise<void> {
    const session = await openSession(this.sessions, sessionId);
    const pending = session.pending;
    if (!pending) return;
    await this.unitOfWork.run(async (stores) => {
      await stores.mistakes.withdraw(sessionId, { language: session.language, original: pending.original });
      await stores.sessions.withdrawPending(sessionId, pending.original);
    });
  }

  /** Saves one turn's writes in a single transaction, after checking no other turn of the session was saved meanwhile. */
  private saveTurn(sessionId: string, turnsSeen: number, write: (stores: TransactionStores) => Promise<void>): Promise<void> {
    return this.unitOfWork.run(async (stores) => {
      const claim = await stores.sessions.claimTurn(sessionId, turnsSeen);
      if (claim === "ended") throw new SessionEndedError(sessionId);
      if (claim === "taken") throw new TurnConflictError(sessionId);
      await write(stores);
    });
  }

  /**
   * The tutor's reply was handed over (and is being spoken) but reading the rest of the turn failed. The two
   * lines are saved without what the turn taught, so "Try again" says that reply again instead of the one before.
   * Best effort: the tutor's failure is what the learner hears about.
   */
  private async keepSpokenReply(session: Session, turnsSeen: number, utterance: string, reply: string): Promise<void> {
    try {
      await this.saveTurn(session.id, turnsSeen, async ({ sessions }) => {
        const assisted = wasAssisted({ scaffoldBefore: session.scaffold, usedFirstLanguage: false });
        await sessions.appendTurn(session.id, { role: "user", content: utterance, assisted });
        await sessions.appendTurn(session.id, { role: "assistant", content: reply });
        // The words given were for this turn; the reply asks for a new one.
        await sessions.setProgress(session.id, {
          coveredGoals: session.coveredGoals,
          lastCheckInAt: session.lastCheckInAt,
          metTargets: session.metTargets,
          scaffold: null,
          keyWords: [],
          step: session.step,
          track: session.track,
        });
      });
    } catch (error) {
      this.logger.error(`Could not keep the spoken reply of session ${session.id}: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  /** In the script, the two ways this turn can move it (stuck or not), so the tutor can follow either. */
  private trackOutcomes(session: Session): TrackOutcomes | null {
    const { track } = session;
    if (!track) return null;
    return trackOutcomes(track, nextGoalAfter(goalsFor(session.mode), track.goal, session.coveredGoals));
  }
}

/** The verdict without the mistakes the learner answered with "I said it right" earlier in the session. */
export function withoutWithdrawn(verdict: TutorVerdict, withdrawn: readonly string[]): TutorVerdict {
  if (!withdrawn.length) return verdict;
  return { ...verdict, issues: verdict.issues.filter((issue) => !withdrawn.some((w) => sameText(w, issue.original))) };
}
