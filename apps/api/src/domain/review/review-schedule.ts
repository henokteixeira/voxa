/**
 * Spaced review (decided with the user on 2026-11-07): a pattern or a new word comes back after 1, 3, 7, 14
 * and then every 30 days. Said right moves it one step forward; a miss (wrong in a review, or the mistake made
 * again in a session) moves it one step back.
 */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;

/** Steps reached with the right answer for a pattern to count as mastered (the 7-day review, recalled 3 times). */
export const MASTERED_STEP = 3;

/** "slow": said right, but only after a long search; it stays at its step instead of moving forward. */
export type ReviewOutcome = "recalled" | "slow" | "missed";

/**
 * Starting to speak later than this after the cue shows counts as a slow recall (decided on 2026-11-10: in a
 * conversation the words have to come fast, so a long search is not yet automatic). The cue is a short sentence to
 * read first, so the bar is generous; to tune with use.
 */
export const SLOW_RECALL_MS = 6_000;

/** The outcome of a spoken answer: missed, recalled, or recalled slowly (null delay: typed, or not measured). */
export function recallOutcome(recalled: boolean, startDelayMs: number | null): ReviewOutcome {
  if (!recalled) return "missed";
  return startDelayMs !== null && startDelayMs > SLOW_RECALL_MS ? "slow" : "recalled";
}

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
  const step =
    outcome === "recalled" ? Math.min(state.step + 1, last) : outcome === "slow" ? state.step : Math.max(state.step - 1, 0);
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

/**
 * The order of a review (2026-11-10): the learner's own mistakes and new words before the expressions taken from
 * a model, each the longest overdue first, so the expressions that join every day never crowd out real mistakes.
 */
export function byReviewPriority<T extends { subject: { kind: string }; dueAt: Date }>(items: readonly T[]): T[] {
  const late = (item: T) => Number(item.subject.kind === "expression");
  return items.toSorted((a, b) => late(a) - late(b) || a.dueAt.getTime() - b.dueAt.getTime());
}
