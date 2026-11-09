import type { SupportStep } from "../level/speaking-level.js";
import type { MissionSituation, NewMissionExpression, NewMissionModel } from "../mission/mission.js";

export interface ModelRequest {
  situation: MissionSituation;
  language: string;
  /** The learner's support step: the model is said at this level. */
  step: SupportStep;
  /** Personal facts that make the model close to the learner's own life and work. */
  learnerContext: string;
}

/** Writes the mission's model and picks its expressions. Implementations live in infra/. */
export interface MissionCoachPort {
  model(request: ModelRequest): Promise<NewMissionModel>;
  /**
   * Step 2: true when the learner's sentence uses the expression in a sentence of their own (small slips elsewhere
   * don't count). Only whether it was used: no hint and no correction.
   */
  usedExpression(language: string, expression: Pick<NewMissionExpression, "phrase" | "example">, utterance: string): Promise<boolean>;
}

export const MISSION_COACH_PORT = Symbol("MISSION_COACH_PORT");
