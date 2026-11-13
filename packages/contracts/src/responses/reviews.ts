import type { MistakeStatus } from "../values.js";

/** What a review asks for: a pattern from the bank, one new word, or an expression from a daily mission. */
export interface ReviewSubject {
  kind: "pattern" | "new_word" | "expression";
  id: string;
}

/** A pattern or new word with its review schedule. */
export interface ReviewItem {
  subject: ReviewSubject;
  language: string;
  category: string;
  /** The pattern's name, or the new word. */
  name: string;
  /** The pattern's rule, or what the learner said in their first language. */
  rule: string;
  examples: { original: string; correction: string }[];
  step: number;
  /** ISO 8601 date-time. */
  dueAt: string;
}

/** One review question: a cue in the learner's first language. The answer stays on the server. */
export interface ReviewCard {
  cardId: string;
  item: ReviewItem;
  cue: string;
}

export interface ReviewAnswer {
  recalled: boolean;
  /** One way to say it. */
  answer: string;
  rule: string;
  /** Another mistake in the answer, in one line in the learner's first language (it kept the answer from counting); null when none. */
  otherMistake: string | null;
  /** ISO 8601 date-time: when the item comes back. */
  nextDueAt: string;
  /** XP the answer earned, right or wrong. */
  xp: number;
}

export interface ReviewOverview {
  due: ReviewItem[];
  /** When the next item not yet due comes back; null when there is none. */
  nextDueAt: string | null;
}

/** Where a pattern or new word is in its review schedule. */
export type ReviewStatus = "new" | "improving" | "mastered";

/** A pattern in the bank, as the Practice tab shows it. */
export interface PracticePattern {
  id: string;
  category: string;
  name: string;
  rule: string;
  status: ReviewStatus;
  /** ISO 8601 date-time; null when it has no review yet. */
  dueAt: string | null;
  occurrences: number;
  /** The learner's sentences that broke it, most recently seen first. */
  sentences: { id: string; original: string; correction: string; occurrences: number; lastSeenAt: string }[];
}

export interface PracticeNewWord {
  id: string;
  word: string;
  /** What the learner said in their first language. */
  said: string;
  status: ReviewStatus;
  dueAt: string | null;
}

/** The Practice tab: patterns by type, new words, and mistakes saved before patterns. */
export interface PracticeView {
  patterns: PracticePattern[];
  newWords: PracticeNewWord[];
  earlier: { id: string; category: string; original: string; correction: string; occurrences: number }[];
}

/** A mistake in the bank, as the Mistakes screen shows it. */
export interface BankMistake {
  id: string;
  /** BCP 47 tag, e.g. "en". */
  language: string;
  original: string;
  correction: string;
  category: string;
  occurrences: number;
  /** ISO 8601 date-time. */
  lastSeenAt: string;
  status: MistakeStatus;
}
