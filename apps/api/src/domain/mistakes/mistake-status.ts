export const MISTAKE_STATUSES = ["open", "improving", "mastered"] as const;
export type MistakeStatus = (typeof MISTAKE_STATUSES)[number];

/** Occurrences in a row the learner must fix alone for a mistake to count as mastered. */
export const MASTERED_STREAK = 3;

/**
 * PROVISIONAL RULE, pending confirmation by the user (PRD open question).
 * Kept in this one function so it is easy to replace.
 *
 * - open: the learner did not fix the latest occurrence alone (or it has none);
 * - improving: the learner fixed the latest occurrence alone;
 * - mastered: the learner fixed the latest MASTERED_STREAK occurrences alone, in a row.
 *
 * @param fixedByLearner for each occurrence, newest first, whether the learner fixed it alone.
 */
export function mistakeStatus(fixedByLearner: readonly boolean[]): MistakeStatus {
  if (!fixedByLearner[0]) return "open";
  const streak = fixedByLearner.slice(0, MASTERED_STREAK);
  return streak.length === MASTERED_STREAK && streak.every(Boolean) ? "mastered" : "improving";
}
