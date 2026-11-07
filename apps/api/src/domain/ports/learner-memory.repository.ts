import type { LearnerFact, RecalledSession, SessionMemory } from "../memory/learner-fact.js";

/** What the tutor remembers about the learner across sessions. */
export interface LearnerMemoryRepository {
  /** Every fact, oldest first. */
  facts(): Promise<LearnerFact[]>;
  /** True once the session's memory was saved (also when it taught nothing). */
  remembered(sessionId: string): Promise<boolean>;
  /**
   * Saves what the session taught, once: false (and nothing saved) when it was already saved.
   * Facts and the session's recap are saved together.
   */
  save(sessionId: string, language: string, memory: SessionMemory, at: Date): Promise<boolean>;
  /** The newest ended sessions that have a recap, newest first. */
  recentSessions(limit: number): Promise<RecalledSession[]>;
}

export const LEARNER_MEMORY_REPOSITORY = Symbol("LEARNER_MEMORY_REPOSITORY");
