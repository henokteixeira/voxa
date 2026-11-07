import type { SupportStep } from "../level/speaking-level.js";

/**
 * The guided track for A1–A2 (leveling and guided track design, approved by the learner on 2026-11-07).
 * Each goal of the meeting goes through short stages, named by what the learner does in them:
 * - model: repeat a short model sentence the tutor says (shadowing);
 * - swap: say the same sentence with their own information;
 * - extend: say a longer sentence (the tutor adds a reason, an "and then" or a result);
 * - answer: answer the meeting's question alone, without a model;
 * - again: say that answer once more, more smoothly.
 * At A1 (build_full) a goal starts at `model`; at A2 (build_light) it starts at `answer`, and the model comes only
 * when the learner is stuck there. The thresholds below are design choices, to tune with real use.
 */
export const TRACK_STAGES = ["model", "swap", "extend", "answer", "again"] as const;
export type TrackStage = (typeof TRACK_STAGES)[number];

export function isTrackStage(value: unknown): value is TrackStage {
  return typeof value === "string" && (TRACK_STAGES as readonly string[]).includes(value);
}

/** Where the learner is in the track. */
export interface TrackState {
  /** What the learner is doing on their next turn. */
  stage: TrackStage;
  /** The goal being built (an id of the mode's goals), or null when the mode has none (free talk). */
  goal: string | null;
  /** Extra tries at this stage (the model said again more slowly, or the same request once more). */
  tries: number;
  /** The learner was stuck at this goal's answer, so the answer was built from the model. */
  helped: boolean;
  /** Goals in a row the learner answered alone. */
  unaidedStreak: number;
  /** Goals in a row the learner was stuck at the answer. */
  stuckStreak: number;
}

/** A stage the learner is stuck at is tried once more, then the track moves on. */
export const MAX_EXTRA_TRIES = 1;
/** Goals in a row that move the session one step (A1 skips the model; A2 brings it back). */
export const STEP_CHANGE_STREAK = 2;
/** Share of the model's words the learner must say for a repetition to count. */
export const REPEAT_MATCH = 0.7;

export function usesTrack(step: SupportStep | null): step is "build_full" | "build_light" {
  return step === "build_full" || step === "build_light";
}

/** The stage a goal starts at. */
export function firstStage(step: "build_full" | "build_light"): TrackStage {
  return step === "build_full" ? "model" : "answer";
}

export function startTrack(step: SupportStep | null, goal: string | null): TrackState | null {
  return usesTrack(step)
    ? { stage: firstStage(step), goal, tries: 0, helped: false, unaidedStreak: 0, stuckStreak: 0 }
    : null;
}

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Whether the learner said enough of the model sentence (speech recognition may drop or change a word). */
export function repeatedModel(model: string, utterance: string): boolean {
  const target = words(model);
  if (target.length === 0) return true;
  const said = words(utterance);
  const found = target.filter((w) => said.includes(w)).length;
  return found / target.length >= REPEAT_MATCH;
}

/** In stages where the learner says words the tutor gave, mistakes are only noted: no hint stops the track. */
export function pausesForHints(stage: TrackStage): boolean {
  return stage === "answer" || stage === "again";
}

/** Whether the learner's turn at this stage can cover a goal: only their own answer counts. */
export function coversGoals(stage: TrackStage): boolean {
  return stage === "answer" || stage === "again";
}

export interface TrackTurn {
  /** The tutor saw the learner as stuck. */
  stuck: boolean;
  /** At `model`: whether the learner repeated the model sentence. Ignored at other stages. */
  repeated: boolean;
  /** The goal to build after this one (the first one not covered yet), or null. */
  nextGoal: string | null;
}

export interface TrackMove {
  track: TrackState;
  /** The session's step after the move: it changes only between A1 and A2. */
  step: "build_full" | "build_light";
  /** The goal the learner covered with this turn (their own answer), or null. */
  covered: string | null;
}

/** The next stage after one learner turn; when a goal ends, the streaks and the step change. */
export function advance(state: TrackState, step: "build_full" | "build_light", turn: TrackTurn): TrackMove {
  const stay = (): TrackMove => ({ track: { ...state, tries: state.tries + 1 }, step, covered: null });
  const go = (stage: TrackStage, over: Partial<TrackState> = {}, covered: string | null = null): TrackMove => ({
    track: { ...state, ...over, stage, tries: 0 },
    step,
    covered,
  });
  const canRetry = state.tries < MAX_EXTRA_TRIES;

  switch (state.stage) {
    case "model":
      return turn.repeated || !canRetry ? go("swap") : stay();
    case "swap":
      return turn.stuck && canRetry ? stay() : go("extend");
    case "extend":
      return turn.stuck && canRetry ? stay() : go("answer");
    case "answer":
      if (!turn.stuck) return go("again", {}, state.goal);
      // Stuck at the answer: build it from the model, once; stuck again, the goal ends and the next one starts.
      return state.helped ? endGoal(state, step, turn.nextGoal) : go("model", { helped: true });
    case "again":
      return endGoal(state, step, turn.nextGoal);
  }
}

/**
 * A goal ends: it counts as answered alone unless the learner was stuck at its answer. A1 that answers alone
 * a few goals in a row skips the model from then on; A2 stuck a few goals in a row gets it back.
 */
function endGoal(state: TrackState, step: "build_full" | "build_light", nextGoal: string | null): TrackMove {
  const unaidedStreak = state.helped ? 0 : state.unaidedStreak + 1;
  const stuckStreak = state.helped ? state.stuckStreak + 1 : 0;
  let next = step;
  if (step === "build_full" && unaidedStreak >= STEP_CHANGE_STREAK) next = "build_light";
  if (step === "build_light" && stuckStreak >= STEP_CHANGE_STREAK) next = "build_full";
  const changed = next !== step;
  return {
    track: {
      stage: firstStage(next),
      goal: nextGoal,
      tries: 0,
      helped: false,
      unaidedStreak: changed ? 0 : unaidedStreak,
      stuckStreak: changed ? 0 : stuckStreak,
    },
    step: next,
    covered: null,
  };
}

/** Stages where the tutor gives the learner words to say (the model, or the longer sentence). */
export function givesWords(stage: TrackStage): boolean {
  return stage === "model" || stage === "swap" || stage === "extend";
}

/** What the tutor's next line does in the guided track. */
export interface TrackStep {
  stage: TrackStage;
  /** The learner did not manage it the first time: say it again, slower or with a little more help. */
  retry: boolean;
  /** The goal being built, or null in free talk. */
  goal: { id: string; description: string } | null;
}

/** The tutor's next line in the guided track, which depends on whether it sees the learner as stuck. */
export interface TrackPlan {
  otherwise: TrackStep;
  ifStuck: TrackStep;
  /** The learner's turn is their own answer: a serious mistake in it gets a hint, so the reply stays short. */
  hintsPause: boolean;
}

/** The goal to build after the current one: the first of the mode's goals not covered yet. */
export function nextGoalAfter(goals: readonly string[], current: string | null, covered: readonly string[]): string | null {
  return goals.find((g) => g !== current && !covered.includes(g)) ?? null;
}

/** Both ways one learner turn can move the track: the tutor's verdict on `stuck` picks one. */
export interface TrackOutcomes {
  ok: TrackMove;
  stuck: TrackMove;
}

/** The track's two possible moves for a learner turn, computed before the tutor answers so it can follow either. */
export function trackOutcomes(input: {
  track: TrackState;
  step: "build_full" | "build_light";
  /** The model sentence the learner is repeating, if any. */
  model: string | null;
  utterance: string;
  nextGoal: string | null;
}): TrackOutcomes {
  const repeated = input.track.stage === "model" ? repeatedModel(input.model ?? "", input.utterance) : false;
  const turn = (stuck: boolean) => advance(input.track, input.step, { stuck, repeated, nextGoal: input.nextGoal });
  return { ok: turn(false), stuck: turn(true) };
}

export function trackStep(track: TrackState, describe: (goal: string) => string | undefined): TrackStep {
  const description = track.goal ? describe(track.goal) : undefined;
  return {
    stage: track.stage,
    retry: track.tries > 0,
    goal: track.goal && description ? { id: track.goal, description } : null,
  };
}

/** The plan for the tutor's line that opens the track (or a stage with nothing to choose). */
export function openingPlan(track: TrackState, describe: (goal: string) => string | undefined): TrackPlan {
  const step = trackStep(track, describe);
  return { otherwise: step, ifStuck: step, hintsPause: false };
}

export function turnPlan(
  track: TrackState,
  outcomes: TrackOutcomes,
  describe: (goal: string) => string | undefined,
): TrackPlan {
  return {
    otherwise: trackStep(outcomes.ok.track, describe),
    ifStuck: trackStep(outcomes.stuck.track, describe),
    hintsPause: pausesForHints(track.stage),
  };
}

/**
 * What a learner turn leaves in the track, once the tutor answered: the move (none while a hint is pending),
 * the goals it covers (only the learner's own answer counts) and the words given for the next turn.
 */
export function resolveTrackTurn(input: {
  track: TrackState;
  outcomes: TrackOutcomes;
  /** The turn ended in a plain reply (not a hint or the correct form). */
  replied: boolean;
  verdict: { stuck: boolean; scaffold: string | null; coveredGoals: string[] };
}): { move: TrackMove | null; reportedGoals: string[]; scaffold: string | null } {
  const { track, outcomes, replied, verdict } = input;
  const move = replied ? (verdict.stuck ? outcomes.stuck : outcomes.ok) : null;
  const reportedGoals = [...(coversGoals(track.stage) ? verdict.coveredGoals : []), ...(move?.covered ? [move.covered] : [])];
  const scaffold = move && givesWords(move.track.stage) ? verdict.scaffold?.trim() || null : null;
  return { move, reportedGoals, scaffold };
}
