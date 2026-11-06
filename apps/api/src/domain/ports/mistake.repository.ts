import type { Severity } from "../conversation/types.js";

export interface Mistake {
  id: string;
  language: string;
  original: string;
  correction: string;
  category: string;
  occurrences: number;
  lastSeenAt: Date;
}

export interface NewMistake {
  language: string;
  original: string;
  correction: string;
  category: string;
}

/** One mistake as it happened in one session. */
export interface SessionMistake {
  original: string;
  correction: string;
  category: string;
  severity: Severity;
  selfCorrected: boolean;
  /** How many times this mistake has been seen across all sessions. */
  occurrences: number;
}

/** Bank of mistakes and expressions. The concrete implementation lives in infra/. */
export interface MistakeRepository {
  record(mistake: NewMistake, occurrence: { sessionId: string; severity: Severity }): Promise<Mistake>;
  /** Marks the session's latest occurrence of this mistake as fixed by the learner. */
  markSelfCorrected(sessionId: string, mistake: { language: string; original: string }): Promise<void>;
  mostFrequent(language: string, limit: number): Promise<Mistake[]>;
  forSession(sessionId: string): Promise<SessionMistake[]>;
}

export const MISTAKE_REPOSITORY = Symbol("MISTAKE_REPOSITORY");
