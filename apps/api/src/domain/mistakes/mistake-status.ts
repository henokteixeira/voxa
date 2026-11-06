export const MISTAKE_STATUSES = ["open", "improving", "mastered"] as const;
export type MistakeStatus = (typeof MISTAKE_STATUSES)[number];

/** Sessions with the correct form, without the mistake, for a mistake to count as mastered. */
export const MASTERED_SESSIONS = 3;

/**
 * Status rule, confirmed by the user on 2026-11-06:
 * - open: the mistake is new, or the learner made it again;
 * - improving: the learner used the correct form in a session after the mistake;
 * - mastered: the learner used the correct form in MASTERED_SESSIONS sessions without making it again.
 *
 * @param sessionsCorrect sessions, after the latest time the mistake was made, in which the learner
 *   used the correct form. Making the mistake again sets it back to 0.
 */
export function mistakeStatus(sessionsCorrect: number): MistakeStatus {
  if (sessionsCorrect >= MASTERED_SESSIONS) return "mastered";
  return sessionsCorrect > 0 ? "improving" : "open";
}
