import type { Severity } from "../conversation/types.js";
import type { KnownPattern, MistakePattern } from "../mistakes/pattern.js";

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
  /** The rule it breaks; null for new words and when the tutor gave none. */
  pattern: MistakePattern | null;
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
  pattern: MistakePattern | null;
}

/** Bank of mistakes and expressions. The concrete implementation lives in infra/. */
export interface MistakeRepository {
  record(mistake: NewMistake, occurrence: { sessionId: string; severity: Severity }): Promise<Mistake>;
  /**
   * Notes that the learner used the correct form of a mistake in this session. Ignored for a mistake
   * that is not in the bank or was made in this same session. Making the mistake again clears these.
   */
  recordCorrectUse(sessionId: string, mistake: { language: string; original: string }): Promise<void>;
  /** Marks the session's latest occurrence of this mistake as fixed by the learner. */
  markSelfCorrected(sessionId: string, mistake: { language: string; original: string }): Promise<void>;
  mostFrequent(language: string, limit: number): Promise<Mistake[]>;
  forSession(sessionId: string): Promise<SessionMistake[]>;
  /** The patterns in this language's bank, most recently seen first, so the tutor reuses their keys. */
  patterns(language: string, limit: number): Promise<KnownPattern[]>;
}

export const MISTAKE_REPOSITORY = Symbol("MISTAKE_REPOSITORY");
