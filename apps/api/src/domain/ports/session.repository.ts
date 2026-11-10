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

/** A session left open, or ended without its XP (the end stopped half way): the server finishes it. */
export interface UnfinishedSession {
  id: string;
  /** When it ended, or its last activity when it is still open: the time it ends at. */
  endsAt: Date;
}

export type TurnClaim = "claimed" | "taken" | "ended";

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
   * saved one after the other. "taken" when the session has more than `turnsSeen` turns (another turn was
   * saved since its history was read), "ended" when it ended meanwhile.
   */
  claimTurn(sessionId: string, turnsSeen: number): Promise<TurnClaim>;
  /** Also marks the session active now. */
  appendTurn(sessionId: string, turn: NewTurn): Promise<void>;
  history(sessionId: string): Promise<ChatTurn[]>;
  setPending(sessionId: string, pending: PendingCorrection | null): Promise<void>;
  /** Stores the goals covered so far, when the tutor last asked whether to stop, the targets met and the help given. */
  setProgress(sessionId: string, progress: SessionProgress): Promise<void>;
  /** The timing the web app measured so far, saved while the session is open. False when it has ended. */
  saveTiming(sessionId: string, timing: SessionTiming): Promise<boolean>;
  /**
   * Up to `limit` unfinished sessions, earliest `endsAt` first, after `after` when given (to page): the open ones
   * with nothing done since `idleBefore`, and the ended ones with no XP whose end was saved between `endedAfter`
   * and `idleBefore`.
   */
  unfinished(query: { idleBefore: Date; endedAfter: Date; limit: number; after?: UnfinishedSession }): Promise<UnfinishedSession[]>;
  /** `endedAt` defaults to now; the end counts as the session's last change. Without a timing, the one saved during the session stays. */
  end(sessionId: string, timing: SessionTiming | null, endedAt?: Date): Promise<void>;
  outcome(sessionId: string): Promise<SessionOutcome | null>;
}

export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");
