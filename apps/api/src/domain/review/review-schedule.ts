/**
 * Spaced review (decided with the user on 2026-11-07): a pattern or a new word comes back after 1, 3, 7, 14
 * and then every 30 days. Said right moves it one step forward; a miss (wrong in a review, or the mistake made
 * again in a session) moves it one step back.
 */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;

/** Steps reached with the right answer for a pattern to count as mastered (the 7-day review, recalled 3 times). */
export const MASTERED_STEP = 3;

export type ReviewOutcome = "recalled" | "missed";

export interface ReviewState {
  /** Index in REVIEW_INTERVALS_DAYS of the wait before the next review. */
  step: number;
  dueAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dueAfter(step: number, now: Date): Date {
  return new Date(now.getTime() + REVIEW_INTERVALS_DAYS[step] * DAY_MS);
}

/** A pattern or word that just entered the bank: first review the next day. */
export function firstReview(now: Date): ReviewState {
  return { step: 0, dueAt: dueAfter(0, now) };
}

/** The state after an answer. */
export function nextReview(state: ReviewState, outcome: ReviewOutcome, now: Date): ReviewState {
  const last = REVIEW_INTERVALS_DAYS.length - 1;
  const step = outcome === "recalled" ? Math.min(state.step + 1, last) : Math.max(state.step - 1, 0);
  return { step, dueAt: dueAfter(step, now) };
}

/** A correct use in a conversation only counts once the review is due, so one good day does not skip steps. */
export function countsAsReview(state: ReviewState, now: Date): boolean {
  return state.dueAt.getTime() <= now.getTime();
}

export type ReviewStatus = "new" | "improving" | "mastered";

export function reviewStatus(step: number): ReviewStatus {
  if (step >= MASTERED_STEP) return "mastered";
  return step > 0 ? "improving" : "new";
}
