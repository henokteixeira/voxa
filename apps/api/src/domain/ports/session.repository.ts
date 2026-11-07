import type { SessionTiming } from "../conversation/fluency.js";
import type { Mode } from "../conversation/mode.js";
import type { ChatTurn, PendingCorrection, PracticeTarget, Session } from "../conversation/types.js";

export type ConfidenceMoment = "before" | "after";

/** What a session leaves for its summary besides mistakes and turns. */
export interface SessionOutcome {
  timing: SessionTiming | null;
  confidence: { before: number | null; after: number | null };
}

export interface SessionProgress {
  coveredGoals: string[];
  lastCheckInAt: Date | null;
  metTargets: string[];
}

export interface SessionRepository {
  /** `startedAt` defaults to now and `targets` to none. */
  create(input: { language: string; mode: Mode; startedAt?: Date; targets?: PracticeTarget[] }): Promise<Session>;
  get(id: string): Promise<Session | null>;
  appendTurn(sessionId: string, turn: ChatTurn): Promise<void>;
  history(sessionId: string): Promise<ChatTurn[]>;
  setPending(sessionId: string, pending: PendingCorrection | null): Promise<void>;
  /** Stores the goals covered so far, when the tutor last asked whether to stop, and the targets met. */
  setProgress(sessionId: string, progress: SessionProgress): Promise<void>;
  end(sessionId: string, timing: SessionTiming | null): Promise<void>;
  /** Stores a 1–5 confidence rating; a new one replaces the old one for that moment. */
  setConfidence(sessionId: string, moment: ConfidenceMoment, value: number): Promise<void>;
  outcome(sessionId: string): Promise<SessionOutcome | null>;
}

export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");
