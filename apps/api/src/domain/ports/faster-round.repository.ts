import type { FasterRound } from "../faster/faster-rounds.js";

/** A round to store, with the session it follows and its language. */
export interface FasterRoundRecord extends FasterRound {
  sessionId: string;
  language: string;
  recordedAt: Date;
}

/** The "say it faster" rounds told after a session. */
export interface FasterRoundRepository {
  /** Stores a round unless the session already has it (a retry); the first one stored is kept. */
  saveOnce(record: FasterRoundRecord): Promise<void>;
  /** The session's rounds, in round order. */
  list(sessionId: string): Promise<FasterRoundRecord[]>;
}

export const FASTER_ROUND_REPOSITORY = Symbol("FASTER_ROUND_REPOSITORY");
