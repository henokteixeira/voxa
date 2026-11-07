import type { SpeakingLevel } from "../level/speaking-level.js";

/** Every level the learner had, per language; the newest one is the current level. */
export interface LevelRepository {
  add(level: SpeakingLevel): Promise<void>;
  /** The newest level for the language, or null when there is none yet. */
  current(language: string): Promise<SpeakingLevel | null>;
  /** When the newest placement session for the language happened, or null. */
  lastPlacementAt(language: string): Promise<Date | null>;
}

export const LEVEL_REPOSITORY = Symbol("LEVEL_REPOSITORY");
