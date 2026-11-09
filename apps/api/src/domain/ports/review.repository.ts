import type { ReviewState } from "../review/review-schedule.js";

/**
 * What a review asks for: a pattern from the bank, one new word (a mistake row with category new_word), or an
 * expression the learner took from a daily mission's model.
 */
export type ReviewSubject = { kind: "pattern"; id: string } | { kind: "new_word"; id: string } | { kind: "expression"; id: string };

export const REVIEW_SUBJECT_KINDS = ["pattern", "new_word", "expression"] as const satisfies readonly ReviewSubject["kind"][];

/** One pattern or new word with its schedule and what a review needs to ask for it. */
export interface ReviewItem {
  subject: ReviewSubject;
  language: string;
  /** The mistake type, new_word, or expression. */
  category: string;
  /** The pattern's label, the new word in the language being learned, or the expression. */
  name: string;
  /** The pattern's rule, what the learner said in their first language, or the model's sentence with the expression. */
  rule: string;
  /** The learner's sentences that broke the pattern, most recent first (for a new word, the word itself). */
  examples: { original: string; correction: string }[];
  step: number;
  dueAt: Date;
}

/** Where one item is in its review schedule. */
export interface ReviewSchedule {
  subject: ReviewSubject;
  step: number;
  dueAt: Date;
}

/** A cue a review gave, and how it was answered. */
export interface StoredReviewCard {
  id: string;
  subject: ReviewSubject;
  cue: string;
  answer: string;
  /** Null until answered. */
  recalled: boolean | null;
}

/** When a card was answered, and for which item. */
export interface AnsweredCard {
  cardId: string;
  itemId: string;
  answeredAt: Date;
}

/** The review schedule of each pattern, new word and expression. The concrete implementation lives in infra/. */
export interface ReviewRepository {
  state(subject: ReviewSubject): Promise<ReviewState | null>;
  /** Creates or replaces the subject's schedule. */
  save(language: string, subject: ReviewSubject, state: ReviewState, reviewedAt: Date | null): Promise<void>;
  /** Items due at `now`, the longest overdue first; dismissed mistakes and patterns left with none are skipped. */
  due(language: string, now: Date, limit: number): Promise<ReviewItem[]>;
  /** One item, due or not; null when it has no schedule, or its mistakes were all dismissed. */
  item(subject: ReviewSubject): Promise<ReviewItem | null>;
  /** Keeps a cue given for the subject's item. */
  addCard(subject: ReviewSubject, cue: { cue: string; answer: string }): Promise<StoredReviewCard>;
  card(id: string): Promise<StoredReviewCard | null>;
  /** Records the answer once: false when the card was already answered (e.g. a retried request). */
  answerCard(id: string, recalled: boolean, at: Date): Promise<boolean>;
  /** The cards in this language answered since a moment: which item each was for and when, oldest first. */
  answeredSince(language: string, since: Date): Promise<AnsweredCard[]>;
  /** Every schedule in this language, due or not (dismissed or not). */
  schedules(language: string): Promise<ReviewSchedule[]>;
  /** When the next item not yet due comes back, or null when there is none. */
  nextDueAt(language: string, now: Date): Promise<Date | null>;
}

export const REVIEW_REPOSITORY = Symbol("REVIEW_REPOSITORY");
