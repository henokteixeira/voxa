import type { SessionTiming } from "../conversation/fluency.js";
import type { Mode } from "../conversation/mode.js";
import type { ChatTurn, PendingCorrection, PracticeTarget, Session } from "../conversation/types.js";
import type { TrackState } from "../conversation/guided-track.js";
import type { SupportStep } from "../level/speaking-level.js";
import type { TutorMemory } from "../memory/learner-fact.js";

/** What a session leaves for its summary besides mistakes and turns. */
export interface SessionOutcome {
  timing: SessionTiming | null;
  /** The learner's turns, and how many of them had help (words given by the tutor, or the first language). */
  learnerTurns: { total: number; assisted: number };
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
  /** `startedAt` defaults to now, `targets` to none, `step` to null and `memory` to nothing remembered. */
  create(input: {
    language: string;
    mode: Mode;
    startedAt?: Date;
    memory?: TutorMemory;
    targets?: PracticeTarget[];
    step?: SupportStep | null;
    track?: TrackState | null;
    /** The daily mission the session is step 3 of. */
    missionId?: string | null;
  }): Promise<Session>;
  get(id: string): Promise<Session | null>;
  /** The newest session started as the mission's step 3 (the learner may start over), or null. */
  latestForMission(missionId: string): Promise<Session | null>;
  /**
   * Inside a unit of work: holds the session until the transaction ends, so two turns of one session are
   * saved one after the other. False when the session has more than `turnsSeen` turns: another turn was
   * saved since its history was read.
   */
  claimTurn(sessionId: string, turnsSeen: number): Promise<boolean>;
  appendTurn(sessionId: string, turn: NewTurn): Promise<void>;
  history(sessionId: string): Promise<ChatTurn[]>;
  setPending(sessionId: string, pending: PendingCorrection | null): Promise<void>;
  /** Stores the goals covered so far, when the tutor last asked whether to stop, the targets met and the help given. */
  setProgress(sessionId: string, progress: SessionProgress): Promise<void>;
  end(sessionId: string, timing: SessionTiming | null): Promise<void>;
  outcome(sessionId: string): Promise<SessionOutcome | null>;
}

export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");
