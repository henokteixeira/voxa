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

export interface Session {
  id: string;
  language: string;
  mode: Mode;
  pending: PendingCorrection | null;
  endedAt: Date | null;
}
