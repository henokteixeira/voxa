import type { ReviewState } from "../review/review-schedule.js";

/** What a review asks for: a pattern from the bank, or one new word (a mistake row with category new_word). */
export type ReviewSubject = { kind: "pattern"; id: string } | { kind: "new_word"; id: string };

/** One item due for review, with what the review needs to ask for it. */
export interface DueReview {
  subject: ReviewSubject;
  language: string;
  /** The mistake type, or new_word. */
  category: string;
  /** The pattern's label, or the new word in the language being learned. */
  name: string;
  /** The pattern's rule, or what the learner said in their first language. */
  rule: string;
  /** The learner's sentences that broke the pattern, most recent first (for a new word, the word itself). */
  examples: { original: string; correction: string }[];
  step: number;
  dueAt: Date;
}

/** The review schedule of each pattern and new word. The concrete implementation lives in infra/. */
export interface ReviewRepository {
  state(subject: ReviewSubject): Promise<ReviewState | null>;
  /** Creates or replaces the subject's schedule. */
  save(language: string, subject: ReviewSubject, state: ReviewState, reviewedAt: Date | null): Promise<void>;
  /** Items due at `now`, the longest overdue first; dismissed mistakes and patterns left with none are skipped. */
  due(language: string, now: Date, limit: number): Promise<DueReview[]>;
  /** When the next item not yet due comes back, or null when there is none. */
  nextDueAt(language: string, now: Date): Promise<Date | null>;
}

export const REVIEW_REPOSITORY = Symbol("REVIEW_REPOSITORY");
