import type { LearnerFact, RecalledSession, SessionMemory } from "../memory/learner-fact.js";

/** What the tutor remembers about the learner across sessions. */
export interface LearnerMemoryRepository {
  /** Every fact, oldest first. */
  facts(): Promise<LearnerFact[]>;
  /** Ended sessions whose memory was not saved yet (a failed or interrupted run), oldest first. */
  unremembered(limit: number): Promise<string[]>;
  /** True once the session's memory was saved (also when it taught nothing). */
  remembered(sessionId: string): Promise<boolean>;
  /**
   * Saves what the session taught, once: false (and nothing saved) when it was already saved.
   * Facts and the session's recap are saved together.
   */
  save(sessionId: string, language: string, memory: SessionMemory, at: Date): Promise<boolean>;
  /** The newest sessions started before `before` that have a recap, newest first. */
  recentSessions(limit: number, before: Date): Promise<RecalledSession[]>;
}

export const LEARNER_MEMORY_REPOSITORY = Symbol("LEARNER_MEMORY_REPOSITORY");
