import type { Mode } from "./mode.js";

/**
 * Session goals, confirmed by the user on 2026-11-07:
 * - each meeting mode has content goals the learner covers; free talk has none and runs on time;
 * - the tutor never ends the session: it asks whether to stop or keep going when the goals are covered,
 *   or after GOAL_TIME_LIMIT_MIN (FREE_TALK_CHECK_IN_MIN in free talk), then every CHECK_IN_EVERY_MIN;
 * - the learner can end the session at any time.
 */
export const SESSION_GOALS = {
  daily: ["yesterday", "today", "blockers"],
  presentation: ["what_it_does", "who_it_serves", "key_decisions", "status", "sponsor_questions"],
  review: ["problem", "change", "testing", "next_steps"],
  free_talk: [],
} as const satisfies Record<Mode, readonly string[]>;

export type SessionGoal = (typeof SESSION_GOALS)[Mode][number];

/** What each goal asks of the learner, in the words the tutor reads. */
export const GOAL_DESCRIPTIONS: Record<SessionGoal, string> = {
  yesterday: "said what they did yesterday",
  today: "said what they will do today",
  blockers: "said whether anything blocks them",
  what_it_does: "explained what the project does",
  who_it_serves: "explained who the project serves",
  key_decisions: "explained at least one key decision and why it was made",
  status: "gave the project's current status",
  sponsor_questions: "answered two of your follow-up questions",
  problem: "explained the problem the work solves",
  change: "explained the change they made",
  testing: "explained how it was tested",
  next_steps: "said what comes next",
};

export const GOAL_TIME_LIMIT_MIN = 15;
export const FREE_TALK_CHECK_IN_MIN = 8;
export const CHECK_IN_EVERY_MIN = 5;

export type CheckInReason = "goals_met" | "time";

/** The question the tutor adds to its reply. Spoken, so it is in the language being practiced. */
export const CHECK_IN_LINES: Record<CheckInReason, string> = {
  goals_met: "We've covered everything for this meeting. Do you want to stop here or keep going?",
  time: "We've been talking for a while. Do you want to stop here or keep going?",
};

export function goalsFor(mode: Mode): readonly SessionGoal[] {
  return SESSION_GOALS[mode];
}

/** Keeps only the goals of this mode, without repeats, in the mode's order. */
export function mergeCovered(mode: Mode, covered: readonly string[], reported: readonly string[]): SessionGoal[] {
  const seen = new Set([...covered, ...reported]);
  return goalsFor(mode).filter((goal) => seen.has(goal));
}

const MINUTE = 60_000;

/**
 * Whether the tutor should ask now if the learner wants to stop or keep going.
 * @param elapsedMs time since the session started
 * @param lastCheckInMs time since the session started when the tutor last asked, or null
 */
export function checkInDue(input: {
  mode: Mode;
  covered: readonly string[];
  elapsedMs: number;
  lastCheckInMs: number | null;
}): CheckInReason | null {
  const { mode, covered, elapsedMs, lastCheckInMs } = input;
  if (lastCheckInMs !== null) return elapsedMs - lastCheckInMs >= CHECK_IN_EVERY_MIN * MINUTE ? "time" : null;

  const goals = goalsFor(mode);
  if (goals.length === 0) return elapsedMs >= FREE_TALK_CHECK_IN_MIN * MINUTE ? "time" : null;
  if (goals.every((goal) => covered.includes(goal))) return "goals_met";
  return elapsedMs >= GOAL_TIME_LIMIT_MIN * MINUTE ? "time" : null;
}
