import type { Mode } from "../conversation/mode.js";
import { FASTER_ROUNDS } from "../faster/faster-rounds.js";
import type { LocalDay } from "../progress/daily-goal.js";

/**
 * The daily mission: one situation a day, in 5 steps (listen, take 3 expressions, do the task, say it faster,
 * review). The app picks the situation, so the learner has nothing to decide.
 */

/** The situations a mission rotates through, work and everyday in turn. Free talk and the placement stay outside. */
export const MISSION_SITUATIONS = ["daily", "my_day", "presentation", "story", "review", "opinion"] as const satisfies readonly Mode[];
export type MissionSituation = (typeof MISSION_SITUATIONS)[number];

/** The category of an expression's review item. */
export const EXPRESSION_CATEGORY = "expression";

/** Each model gives exactly this many expressions to take. */
export const MISSION_EXPRESSIONS = 3;

export function isMissionSituation(value: unknown): value is MissionSituation {
  return typeof value === "string" && (MISSION_SITUATIONS as readonly string[]).includes(value);
}

/** The situation after the last mission's (the first one when there was none). */
export function nextSituation(last: MissionSituation | null): MissionSituation {
  if (last === null) return MISSION_SITUATIONS[0];
  return MISSION_SITUATIONS[(MISSION_SITUATIONS.indexOf(last) + 1) % MISSION_SITUATIONS.length];
}

/** A ready-made expression from the model, to say in a sentence of one's own. */
export interface NewMissionExpression {
  /** 1 to 3. */
  position: number;
  /** The reusable chunk, e.g. "I'm blocked by…". */
  phrase: string;
  /** The model's sentence that uses it. */
  example: string;
}

/** A stored expression: it can come back in the spaced review. */
export interface MissionExpression extends NewMissionExpression {
  id: string;
  /** When the learner first used it in a sentence of their own (step 2); null until then. */
  saidAt: Date | null;
}

/** Step 1: someone does the situation's task first, at the learner's level. */
export interface NewMissionModel {
  /** Who speaks in the model, e.g. "Alex". */
  speaker: string;
  /** What they say, as one spoken text. */
  text: string;
  expressions: NewMissionExpression[];
}

export interface MissionModel extends NewMissionModel {
  expressions: MissionExpression[];
}

/** The steps whose end the learner marks; the task and "say it faster" are read from the session. */
export const MARKED_STEPS = ["listen", "expressions", "review"] as const;
export type MarkedStep = (typeof MARKED_STEPS)[number];

export interface Mission {
  id: string;
  language: string;
  /** The learner's local day; midnight brings a new mission. */
  day: LocalDay;
  situation: MissionSituation;
  createdAt: Date;
  /** Null until step 1 first asks for it. */
  model: MissionModel | null;
  listenedAt: Date | null;
  expressionsDoneAt: Date | null;
  reviewDoneAt: Date | null;
}

/** Which steps are done. `checkIn` is step 0, only on check-in day: null on the other days. */
export interface MissionSteps {
  checkIn: boolean | null;
  listen: boolean;
  expressions: boolean;
  task: boolean;
  faster: boolean;
  review: boolean;
}

export interface MissionFacts {
  /** The check-in is due now, or was recorded on the mission's day. */
  checkIn: { due: boolean; doneToday: boolean };
  /** Step 3's conversation has ended. */
  taskEnded: boolean;
  /** How many "say it faster" rounds step 4 told. */
  fasterRounds: number;
}

export function missionSteps(mission: Pick<Mission, "listenedAt" | "expressionsDoneAt" | "reviewDoneAt">, facts: MissionFacts): MissionSteps {
  const { due, doneToday } = facts.checkIn;
  return {
    checkIn: doneToday ? true : due ? false : null,
    listen: mission.listenedAt !== null,
    expressions: mission.expressionsDoneAt !== null,
    task: facts.taskEnded,
    faster: facts.fasterRounds >= FASTER_ROUNDS,
    review: mission.reviewDoneAt !== null,
  };
}

/** The mission is done once every step of the day is. */
export function missionDone(steps: MissionSteps): boolean {
  return Object.values(steps).every((done) => done !== false);
}
