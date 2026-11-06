import type { TutorVerdict } from "../conversation/correction-policy.js";
import type { Mode } from "../conversation/mode.js";
import type { ChatTurn, PendingCorrection } from "../conversation/types.js";

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
}

export interface TutorRequest extends TutorContext {
  history: ChatTurn[];
  pending: PendingCorrection | null;
  knownMistakes: KnownMistake[];
  utterance: string;
}

/** The AI tutor. Implementations live in infra/. */
export interface TutorPort {
  /** The tutor's first line, which opens the scene for the mode. */
  open(context: TutorContext): Promise<string>;
  /** Reads the learner's utterance: mistakes, whether a pending one is fixed, and the next line. */
  evaluate(request: TutorRequest): Promise<TutorVerdict>;
}

export const TUTOR_PORT = Symbol("TUTOR_PORT");
