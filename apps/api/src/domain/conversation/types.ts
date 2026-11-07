import type { SupportStep } from "../level/speaking-level.js";
import type { MistakePattern } from "../mistakes/pattern.js";
import type { TrackState } from "./guided-track.js";
import type { Mode } from "./mode.js";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type Severity = "serious" | "minor";

/** Bank category for words the learner said in their first language: a word to learn, not a mistake. */
export const NEW_WORD_CATEGORY = "new_word";

/** Words the learner said in their first language, and how to say them in the language being learned. */
export interface NewWord {
  said: string;
  words: string;
}

/** A mistake the tutor found in the learner's last utterance. */
export interface Issue {
  original: string;
  correction: string;
  category: string;
  severity: Severity;
  /** A clue that helps the learner fix it alone. Never the corrected sentence. */
  hint: string;
  /** True when the tutor matched it to a mistake already in the learner's bank. */
  matchesKnownMistake: boolean;
  /** The rule it breaks; null when the tutor gave none. */
  pattern: MistakePattern | null;
}

/** A serious mistake the conversation is paused on until the learner fixes it. */
export interface PendingCorrection {
  original: string;
  correction: string;
  category: string;
  hintsGiven: number;
  /** True once the tutor has shown the correct form and asked the learner to repeat it. */
  revealed: boolean;
}

/** A mistake from the bank the learner practices in this session: the tutor gives chances to say it right. */
export interface PracticeTarget {
  original: string;
  correction: string;
  category: string;
}

export interface Session {
  id: string;
  language: string;
  mode: Mode;
  pending: PendingCorrection | null;
  startedAt: Date;
  endedAt: Date | null;
  /** Goals of the mode the learner has covered so far. */
  coveredGoals: string[];
  /** When the tutor last asked whether to stop or keep going, or null. */
  lastCheckInAt: Date | null;
  targets: PracticeTarget[];
  /** The `original` of each target the learner said correctly in this session. */
  metTargets: string[];
  /** How much help the session gives, from the learner's level; null in the placement interview. */
  step: SupportStep | null;
  /** Words the tutor's last line gave the learner to say (a model sentence or a sentence start), or null. */
  scaffold: string | null;
  /** Where the learner is in the guided track (A1–A2 steps only), or null. */
  track: TrackState | null;
}
