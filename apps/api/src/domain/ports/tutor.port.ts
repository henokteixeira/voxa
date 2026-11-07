import type { TutorVerdict } from "../conversation/correction-policy.js";
import type { Mode } from "../conversation/mode.js";
import type { ChatTurn, PendingCorrection, PracticeTarget } from "../conversation/types.js";
import type { SupportStep } from "../level/speaking-level.js";

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
  /** What the learner should cover in this meeting; empty in free talk. */
  goals: { id: string; description: string }[];
  /** Mistakes from the bank the tutor gives the learner chances to say correctly. */
  targets: PracticeTarget[];
  /** How much help to give, from the learner's level; null in the placement interview. */
  step: SupportStep | null;
}

export interface TutorRequest extends TutorContext {
  history: ChatTurn[];
  pending: PendingCorrection | null;
  knownMistakes: KnownMistake[];
  /** Words the learner once said in their first language: `original` as said, `correction` in the target language. */
  knownNewWords: KnownMistake[];
  utterance: string;
  /** Ids of the goals covered before this utterance. */
  coveredGoals: string[];
  /** Words the tutor's last line gave the learner to say (the learner may be completing them), or null. */
  scaffold: string | null;
}

/** The AI tutor. Implementations live in infra/. */
export interface TutorPort {
  /** The tutor's first line, which opens the scene for the mode. */
  open(context: TutorContext): Promise<string>;
  /**
   * Reads the learner's utterance: mistakes, whether a pending one is fixed, and the next line.
   * `onReply` gets the next line as soon as it is written, while the rest of the reading goes on.
   */
  evaluate(request: TutorRequest, onReply?: (reply: string) => void): Promise<TutorVerdict>;
}

/** The tutor could not answer (provider down, refusal, cut-off or invalid output). */
export class TutorUnavailableError extends Error {}

export const TUTOR_PORT = Symbol("TUTOR_PORT");
