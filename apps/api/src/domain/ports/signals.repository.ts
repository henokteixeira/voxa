import type { Mode } from "../conversation/mode.js";
import type { SessionSignals } from "../progress/signal-trend.js";

/** The signals of one ended practice session (placement interviews are not stored: they give no help). */
export interface SessionSignalsRecord {
  sessionId: string;
  language: string;
  mode: Mode;
  signals: SessionSignals;
  recordedAt: Date;
}

/** Each practice session's signals, per language, to compare sessions and show them over time. */
export interface SignalsRepository {
  /**
   * Stores a session's signals unless it already has them (ending twice, or two ends racing).
   * Returns the record stored for the session either way.
   */
  recordOnce(record: SessionSignalsRecord): Promise<SessionSignalsRecord>;
  /** The records of the same language stored before this session's record, newest first, at most `limit`. */
  earlierThan(sessionId: string, limit: number): Promise<SessionSignalsRecord[]>;
}

export const SIGNALS_REPOSITORY = Symbol("SIGNALS_REPOSITORY");
