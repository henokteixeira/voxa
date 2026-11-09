import type { Mission, MissionModel, MissionSituation, NewMissionModel } from "../mission/mission.js";
import type { LocalDay } from "../progress/daily-goal.js";

export interface NewMission {
  language: string;
  day: LocalDay;
  situation: MissionSituation;
  createdAt: Date;
}

/** The daily missions. The concrete implementation lives in infra/. */
export interface MissionRepository {
  /** Creates the day's mission; when the day already has one (two requests at once), that one is returned. */
  create(mission: NewMission): Promise<Mission>;
  forDay(language: string, day: LocalDay): Promise<Mission | null>;
  /** The newest mission in the language before this day, for the rotation. */
  latestBefore(language: string, day: LocalDay): Promise<Mission | null>;
  get(id: string): Promise<Mission | null>;
  /** Keeps the mission's model once: when it already has one (two requests at once), that one is kept and returned. */
  saveModel(id: string, model: NewMissionModel): Promise<MissionModel>;
  /** Records the first time the learner used the expression; false when it was already used (or doesn't exist). */
  markSaid(expressionId: string, at: Date): Promise<boolean>;
}

export const MISSION_REPOSITORY = Symbol("MISSION_REPOSITORY");
