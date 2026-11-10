import type { Mode } from "../modes.js";

/** The situations the daily mission goes round, one a day. */
export type MissionSituation = Extract<Mode, "daily" | "my_day" | "presentation" | "story" | "review" | "opinion">;

/** Which of the mission's steps are done. `checkIn` is step 0 on check-in day only (null on other days). */
export interface MissionSteps {
  checkIn: boolean | null;
  listen: boolean;
  expressions: boolean;
  task: boolean;
  faster: boolean;
  review: boolean;
}

export interface MissionView {
  id: string;
  language: string;
  /** The learner's local day, YYYY-MM-DD. */
  day: string;
  situation: MissionSituation;
  steps: MissionSteps;
  done: boolean;
  /** Step 3's conversation, once started. */
  sessionId: string | null;
}

export interface MissionExpression {
  id: string;
  position: number;
  /** The reusable chunk, e.g. "I'm blocked by…". */
  phrase: string;
  /** The model's sentence that uses it. */
  example: string;
  /** ISO 8601; null until the learner used it in a sentence of their own. */
  saidAt: string | null;
}

/** Step 1: someone else does the same task first, at the learner's level. */
export interface MissionModel {
  speaker: string;
  text: string;
  expressions: MissionExpression[];
}
