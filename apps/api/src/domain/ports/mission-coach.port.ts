import type { SupportStep } from "../level/speaking-level.js";
import type { MissionSituation, NewMissionModel } from "../mission/mission.js";

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
}

export const MISSION_COACH_PORT = Symbol("MISSION_COACH_PORT");
