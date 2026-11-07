import type { TutorVerdict } from "../conversation/correction-policy.js";
import type { TrackPlan } from "../conversation/guided-track.js";
import type { Mode } from "../conversation/mode.js";
import type { ChatTurn, PendingCorrection, PracticeTarget } from "../conversation/types.js";
import { DomainError } from "../errors.js";
import type { SupportStep } from "../level/speaking-level.js";
import type { TutorMemory } from "../memory/learner-fact.js";
import type { KnownPattern } from "../mistakes/pattern.js";

export interface KnownMistake {
  original: string;
  correction: string;
  category: string;
}

export interface TutorContext {
  mode: Mode;
  language: string;
  /** Free-text facts about the learner (role, projects, vocabulary). */
  learnerContext: string;
  /** What the learner told the tutor in earlier sessions. Absent: nothing remembered. */
  memory?: TutorMemory;
  /** What the learner should cover in this session; empty in free talk. */
  goals: { id: string; description: string }[];
  /** Mistakes from the bank the tutor gives the learner chances to say correctly. */
  targets: PracticeTarget[];
  /** How much help to give, from the learner's level; null in the placement interview. */
  step: SupportStep | null;
}

export interface TutorOpening {
  line: string;
  /** Words the opening gives the learner to say (the guided track's first model sentence), or null. */
  scaffold: string | null;
}

export interface TutorRequest extends TutorContext {
  history: ChatTurn[];
  pending: PendingCorrection | null;
  knownMistakes: KnownMistake[];
  /** Words the learner once said in their first language: `original` as said, `correction` in the target language. */
  knownNewWords: KnownMistake[];
  /** Patterns already in the bank: a mistake that breaks one of them reuses its key. */
  knownPatterns: KnownPattern[];
  /**
   * Patterns broken a few turns ago in this session: the next line may ask something whose answer needs one
   * of them, so the learner uses it again (decided with the user on 2026-11-07).
   */
  bringBack: KnownPattern[];
  utterance: string;
  /** Ids of the goals covered before this utterance. */
  coveredGoals: string[];
  /** Words the tutor's last line gave the learner to say (the learner may be completing them), or null. */
  scaffold: string | null;
  /** In the guided track (A1–A2): what the next line does; null otherwise. */
  plan: TrackPlan | null;
}

/** The AI tutor. Implementations live in infra/. */
export interface TutorPort {
  /** The tutor's first line, which opens the scene for the mode (and, in the guided track, does its first step). */
  open(context: TutorContext, plan?: TrackPlan | null): Promise<TutorOpening>;
  /**
   * Reads the learner's utterance: mistakes, whether a pending one is fixed, and the next line.
   * `onReply` gets the next line as soon as it is written, while the rest of the reading goes on.
   */
  evaluate(request: TutorRequest, onReply?: (reply: string) => void): Promise<TutorVerdict>;
}

/** The tutor could not answer (provider down, refusal, cut-off or invalid output). */
export class TutorUnavailableError extends DomainError {
  readonly code = "tutor_unavailable";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, "The tutor is not available right now.", options);
  }
}

export const TUTOR_PORT = Symbol("TUTOR_PORT");

export type { TrackPlan, TrackStep } from "../conversation/guided-track.js";
