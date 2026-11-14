import { TRACK_STAGES, TRACK_SUPPORTS, type TrackStage, type TrackSupport } from "@voxa/contracts";
import type { SupportStep } from "../level/speaking-level.js";

/**
 * The step-by-step script for A1–B1 (approved by the learner on 2026-11-14; it replaced the earlier guided track).
 * Each goal of the session is one step: the tutor asks one short question for it and gives words to answer with,
 * from most to least (`TRACK_SUPPORTS`):
 * - example: a short example sentence the learner changes with their own information;
 * - frame: a sentence to complete, with ___ blanks and up to 3 key words;
 * - start: only the start of a sentence;
 * - alone: only the question.
 * Answered without being stuck, the goal is covered and the next one starts; `FADE_STREAK` goals in a row like that
 * move one level down. Stuck, the same goal is asked once more with one level more, then the script moves on.
 * After the goals, the last step (`retell`) asks the learner to put it all together in one short talk.
 * The thresholds below are design choices, to tune with real use.
 */
export { TRACK_STAGES, TRACK_SUPPORTS, type TrackStage, type TrackSupport };

export function isTrackStage(value: unknown): value is TrackStage {
  return typeof value === "string" && (TRACK_STAGES as readonly string[]).includes(value);
}

export function isTrackSupport(value: unknown): value is TrackSupport {
  return typeof value === "string" && (TRACK_SUPPORTS as readonly string[]).includes(value);
}

/** Where the learner is in the script. */
export interface TrackState {
  stage: TrackStage;
  /** The goal of this step (an id of the mode's goals); null at the last step. */
  goal: string | null;
  /** The words given for the next answer. */
  support: TrackSupport;
  /** Extra tries at this step (asked again with more help). */
  tries: number;
  /** Goals in a row answered without being stuck, at the current level of support. */
  unaidedStreak: number;
}

/** Goals in a row answered without being stuck that move the support one level down. */
export const FADE_STREAK = 2;
/** A step the learner is stuck at is asked once more, then the script moves on. */
export const MAX_EXTRA_TRIES = 1;

/** The script runs from A1 to B1, and at B2 when the learner turned it on, in conversations that have goals. */
export function usesTrack(step: SupportStep | null, guidedAtB2 = false): boolean {
  return step === "build_full" || step === "build_light" || step === "supported" || (step === "conversation" && guidedAtB2);
}

/** The words a session's first step gives: the example at A1, the sentence to complete at A2 and B1, a start at B2. */
export function firstSupport(step: SupportStep): TrackSupport {
  return step === "build_full" ? "example" : step === "conversation" ? "start" : "frame";
}

/** The script's first step, or null where it does not run (from B2 up unless turned on, or a mode without goals). */
export function startTrack(step: SupportStep | null, goals: readonly string[], guidedAtB2 = false): TrackState | null {
  if (!step || !usesTrack(step, guidedAtB2) || goals.length === 0) return null;
  return { stage: "answer", goal: goals[0], support: firstSupport(step), tries: 0, unaidedStreak: 0 };
}

const fewer = (support: TrackSupport): TrackSupport => TRACK_SUPPORTS[Math.min(TRACK_SUPPORTS.indexOf(support) + 1, TRACK_SUPPORTS.length - 1)];
const more = (support: TrackSupport): TrackSupport => TRACK_SUPPORTS[Math.max(TRACK_SUPPORTS.indexOf(support) - 1, 0)];

/** What the screen shows: "step 2 of 5 · goal"; the last step is putting it all together. */
export interface TrackView {
  stage: TrackStage;
  support: TrackSupport;
  goal: string | null;
  /** 1-based number of the step. */
  number: number;
  total: number;
}

export function trackView(track: TrackState | null, goals: readonly string[]): TrackView | null {
  if (!track) return null;
  const total = goals.length + 1;
  const number = track.stage === "retell" ? total : Math.max(goals.indexOf(track.goal ?? ""), 0) + 1;
  return { stage: track.stage, support: track.support, goal: track.stage === "retell" ? null : track.goal, number, total };
}

export interface TrackMove {
  /** The next step, or null once the learner put it all together (the script is over). */
  track: TrackState | null;
  /** The goal the learner covered with this turn, or null. */
  covered: string | null;
}

/** The next step after one learner turn. `nextGoal` is the goal after this one not covered yet, or null. */
export function advance(state: TrackState, turn: { stuck: boolean; nextGoal: string | null }): TrackMove {
  const canRetry = state.tries < MAX_EXTRA_TRIES;
  if (state.stage === "retell") {
    return turn.stuck && canRetry ? { track: { ...state, tries: state.tries + 1 }, covered: null } : { track: null, covered: null };
  }
  if (turn.stuck && canRetry) {
    return { track: { ...state, support: more(state.support), tries: state.tries + 1, unaidedStreak: 0 }, covered: null };
  }
  // Answered, or stuck twice: the next step. An answer covers the goal; only one given at the first try fades the help.
  // The extra help a retry gave stays until the learner does well again.
  const answered = !turn.stuck;
  const streak = answered && state.tries === 0 ? state.unaidedStreak + 1 : 0;
  const fade = streak >= FADE_STREAK;
  const support = fade ? fewer(state.support) : state.support;
  const next: TrackState = turn.nextGoal
    ? { stage: "answer", goal: turn.nextGoal, support, tries: 0, unaidedStreak: fade ? 0 : streak }
    : { stage: "retell", goal: null, support, tries: 0, unaidedStreak: 0 };
  return { track: next, covered: answered ? state.goal : null };
}

/** Whether the tutor gives words for this step: all but a goal answered alone (the last step gives the parts' starts). */
export function givesWords(track: TrackState): boolean {
  return track.stage === "retell" || track.support !== "alone";
}

/** What the tutor's next line does in the script. */
export interface TrackStep {
  stage: TrackStage;
  support: TrackSupport;
  /** The learner did not manage it the first time: asked again, with more help. */
  retry: boolean;
  /** The goal of this step, or null at the last step. */
  goal: { id: string; description: string } | null;
  /** Today's expressions to work into the words given, when they fit. */
  expressions: string[];
}

/** The tutor's next line in the script, which depends on whether it sees the learner as stuck. */
export interface TrackPlan {
  otherwise: TrackStep | null;
  ifStuck: TrackStep | null;
}

/**
 * The goal after the current one: the next of the mode's goals, in order, not covered yet. A goal the script moved past
 * (the learner was stuck twice) does not come back.
 */
export function nextGoalAfter(goals: readonly string[], current: string | null, covered: readonly string[]): string | null {
  return goals.slice(goals.indexOf(current ?? "") + 1).find((g) => !covered.includes(g)) ?? null;
}

/** Both ways one learner turn can move the script: the tutor's verdict on `stuck` picks one. */
export interface TrackOutcomes {
  ok: TrackMove;
  stuck: TrackMove;
}

export function trackOutcomes(track: TrackState, nextGoal: string | null): TrackOutcomes {
  return { ok: advance(track, { stuck: false, nextGoal }), stuck: advance(track, { stuck: true, nextGoal }) };
}

export function trackStep(
  track: TrackState,
  describe: (goal: string) => string | undefined,
  expressions: readonly string[] = [],
): TrackStep {
  const description = track.goal ? describe(track.goal) : undefined;
  return {
    stage: track.stage,
    support: track.support,
    retry: track.tries > 0,
    goal: track.goal && description ? { id: track.goal, description } : null,
    expressions: [...expressions],
  };
}

/** The plan for the line that opens the script. */
export function openingPlan(track: TrackState, describe: (goal: string) => string | undefined, expressions?: readonly string[]): TrackPlan {
  const step = trackStep(track, describe, expressions);
  return { otherwise: step, ifStuck: step };
}

export function turnPlan(outcomes: TrackOutcomes, describe: (goal: string) => string | undefined, expressions?: readonly string[]): TrackPlan {
  const step = (move: TrackMove) => (move.track ? trackStep(move.track, describe, expressions) : null);
  return { otherwise: step(outcomes.ok), ifStuck: step(outcomes.stuck) };
}

/**
 * What a learner turn leaves in the script, once the tutor answered: the move (none while a hint is pending),
 * the goal it covers and the words given for the next turn.
 */
export function resolveTrackTurn(input: {
  outcomes: TrackOutcomes;
  /** The turn ended in a plain reply (not a hint or the correct form). */
  replied: boolean;
  verdict: { stuck: boolean; scaffold: string | null; keyWords: string[] };
}): { move: TrackMove | null; scaffold: string | null; keyWords: string[] } {
  const { outcomes, replied, verdict } = input;
  const move = replied ? (verdict.stuck ? outcomes.stuck : outcomes.ok) : null;
  const gives = move?.track ? givesWords(move.track) : false;
  const scaffold = gives ? verdict.scaffold?.trim() || null : null;
  const keyWords = scaffold && move?.track?.stage === "answer" && move.track.support === "frame" ? verdict.keyWords.slice(0, 3) : [];
  return { move, scaffold, keyWords };
}
