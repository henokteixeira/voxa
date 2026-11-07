import type { ChatTurn } from "../conversation/types.js";
import type { CefrLevel } from "../level/speaking-level.js";

export interface LevelAssessment {
  level: CefrLevel;
  /** Two or three of the learner's own sentences, copied exactly, that back the level. */
  evidence: string[];
}

/** Estimates the learner's speaking level from a placement interview. Implementations live in infra/. */
export interface LevelAssessorPort {
  assess(input: { language: string; turns: ChatTurn[] }): Promise<LevelAssessment>;
}

export const LEVEL_ASSESSOR_PORT = Symbol("LEVEL_ASSESSOR_PORT");
