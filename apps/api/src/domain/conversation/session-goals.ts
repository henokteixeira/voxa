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
  // The placement interview's tasks, from the easiest CEFR level up (see domain/level).
  placement: ["warm_up", "routine", "past_work", "project", "opinion"],
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
  sponsor_questions: "answered at least two of your follow-up questions (count the answers in the conversation)",
  problem: "explained the problem the work solves",
  change: "explained the change they made",
  testing: "explained how it was tested",
  next_steps: "said what comes next",
  warm_up: "answered simple questions about themselves (name, role, where they work) (A1 task)",
  routine: "described their usual workday or current job in simple terms (A2 task)",
  past_work: "told what they did recently and why, connecting a few sentences (B1 task)",
  project: "explained a project in some detail and answered an unexpected question about it (B2 task)",
  opinion: "argued a point of view with advantages and disadvantages (C1 task)",
};

export const GOAL_TIME_LIMIT_MIN = 15;
/** The placement interview is short (design doc: 6 to 8 minutes); the tutor asks to stop after this. */
export const PLACEMENT_TIME_LIMIT_MIN = 10;
export const FREE_TALK_CHECK_IN_MIN = 8;
export const CHECK_IN_EVERY_MIN = 5;

export type CheckInReason = "goals_met" | "time" | "placement_done";

/**
 * The question the tutor adds to its reply, by the primary subtag of the language being practiced (it is
 * spoken in that language). A new language adds its lines here; until then it falls back to English.
 */
const CHECK_IN_LINES: Record<string, Record<CheckInReason, string>> = {
  en: {
    goals_met: "We've covered everything for this meeting. Do you want to stop here or keep going?",
    time: "We've been talking for a while. Do you want to stop here or keep going?",
    placement_done: "That's all I wanted to ask. Shall we stop here so you can see your level?",
  },
};

export function checkInLine(reason: CheckInReason, language: string): string {
  const lines = CHECK_IN_LINES[language.split("-")[0].toLowerCase()] ?? CHECK_IN_LINES.en;
  return lines[reason];
}

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
 * @param coveredBefore goals covered before this turn; `covered` includes this turn's
 * @param elapsedMs time since the session started
 * @param lastCheckInMs time since the session started when the tutor last asked, or null
 */
export function checkInDue(input: {
  mode: Mode;
  coveredBefore: readonly string[];
  covered: readonly string[];
  elapsedMs: number;
  lastCheckInMs: number | null;
}): CheckInReason | null {
  const { mode, coveredBefore, covered, elapsedMs, lastCheckInMs } = input;
  const goals = goalsFor(mode);
  const all = (list: readonly string[]) => goals.length > 0 && goals.every((goal) => list.includes(goal));
  // Asks once the goals are all covered: on the turn that covers the last one (even after an earlier
  // question about time), or on the next turn that can ask when that one could not (it gave a hint).
  // In the placement interview "covered" also means skipped as too hard: the interview is over, not a meeting.
  const done = mode === "placement" ? "placement_done" : "goals_met";
  if (all(covered) && (!all(coveredBefore) || lastCheckInMs === null)) return done;
  if (lastCheckInMs !== null) return elapsedMs - lastCheckInMs >= CHECK_IN_EVERY_MIN * MINUTE ? "time" : null;
  const limit =
    mode === "placement" ? PLACEMENT_TIME_LIMIT_MIN : goals.length === 0 ? FREE_TALK_CHECK_IN_MIN : GOAL_TIME_LIMIT_MIN;
  return elapsedMs >= limit * MINUTE ? "time" : null;
}
