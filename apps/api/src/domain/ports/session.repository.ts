import type { SessionTiming } from "../conversation/fluency.js";
import type { Mode } from "../conversation/mode.js";
import type { ChatTurn, PendingCorrection, PracticeTarget, Session } from "../conversation/types.js";
import type { TrackState } from "../conversation/guided-track.js";
import type { SupportStep } from "../level/speaking-level.js";

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
  /** Words the tutor's last line gave the learner to say, or null. */
  scaffold: string | null;
  /** The step can move between A1 and A2 inside the guided track. */
  step: SupportStep | null;
  track: TrackState | null;
}

/** A turn to store. `assisted` (learner turns only): the learner answered words the tutor gave, or used the first language. */
export type NewTurn = ChatTurn & { assisted?: boolean };

export interface SessionRepository {
  /** `startedAt` defaults to now, `targets` to none and `step` to null. */
  create(input: {
    language: string;
    mode: Mode;
    startedAt?: Date;
    targets?: PracticeTarget[];
    step?: SupportStep | null;
    track?: TrackState | null;
  }): Promise<Session>;
  get(id: string): Promise<Session | null>;
  appendTurn(sessionId: string, turn: NewTurn): Promise<void>;
  history(sessionId: string): Promise<ChatTurn[]>;
  setPending(sessionId: string, pending: PendingCorrection | null): Promise<void>;
  /** Stores the goals covered so far, when the tutor last asked whether to stop, the targets met and the help given. */
  setProgress(sessionId: string, progress: SessionProgress): Promise<void>;
  end(sessionId: string, timing: SessionTiming | null): Promise<void>;
  /** Stores a 1–5 confidence rating; a new one replaces the old one for that moment. */
  setConfidence(sessionId: string, moment: ConfidenceMoment, value: number): Promise<void>;
  outcome(sessionId: string): Promise<SessionOutcome | null>;
}

export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");
