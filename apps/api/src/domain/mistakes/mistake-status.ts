export const MISTAKE_STATUSES = ["open", "improving", "mastered"] as const;
export type MistakeStatus = (typeof MISTAKE_STATUSES)[number];

/** Occurrences in a row the learner must fix alone for a mistake to count as mastered. */
export const MASTERED_STREAK = 3;
/** Practice sessions in a row without the mistake for it to count as mastered. */
export const MASTERED_SESSIONS_WITHOUT = 5;

export interface MistakeHistory {
  /** For each occurrence, newest first: whether the learner fixed it alone. */
  fixedByLearner: readonly boolean[];
  /** Practice sessions held, in the same language, after the latest occurrence. */
  sessionsSince: number;
}

/**
 * Status rule, confirmed by the user on 2026-11-06:
 *
 * - mastered: the learner fixed the latest MASTERED_STREAK occurrences alone, in a row,
 *   or the mistake has not come back in MASTERED_SESSIONS_WITHOUT sessions;
 * - improving: the learner fixed the latest occurrence alone;
 * - open: otherwise.
 */
export function mistakeStatus({ fixedByLearner, sessionsSince }: MistakeHistory): MistakeStatus {
  if (sessionsSince >= MASTERED_SESSIONS_WITHOUT) return "mastered";
  if (!fixedByLearner[0]) return "open";
  const streak = fixedByLearner.slice(0, MASTERED_STREAK);
  return streak.length === MASTERED_STREAK && streak.every(Boolean) ? "mastered" : "improving";
}
