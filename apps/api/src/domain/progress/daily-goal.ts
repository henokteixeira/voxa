/**
 * XP, the daily goal and the streak (design approved on 2026-11-07: "Voxa: XP, daily goal and sounds").
 * The numbers are design choices to tune with real use, not research findings.
 * Making a mistake never takes XP away: XP only rewards practicing, trying and fixing.
 */

/** How long the learner wants to practice each day. */
export const DAILY_MINUTES = [15, 30, 45, 60] as const;
export type DailyMinutes = (typeof DAILY_MINUTES)[number];
export const DEFAULT_DAILY_MINUTES: DailyMinutes = 30;

/** About 1 XP a minute of conversation, plus about 30% from bonuses, so the goal closes near the chosen time. */
const GOAL_XP: Record<DailyMinutes, number> = { 15: 20, 30: 40, 45: 60, 60: 80 };

export function dailyGoalXp(minutes: DailyMinutes): number {
  return GOAL_XP[minutes];
}

/** What earns XP. */
export const XP_REASONS = ["practice_minute", "goal_covered", "self_corrected", "personal_record"] as const;
export type XpReason = (typeof XP_REASONS)[number];

/** XP for each time a reason happens. The web app reads this table from the API to show XP as it happens. */
export const XP_POINTS: Record<XpReason, number> = {
  practice_minute: 1,
  goal_covered: 5,
  self_corrected: 5,
  personal_record: 5,
};

/** XP earned in one session, by reason. */
export interface XpAward {
  reason: XpReason;
  /** How many times it happened (minutes, goals, self-corrections, records). */
  count: number;
  points: number;
}

/** What a session did that earns XP. */
export interface SessionAchievements {
  /** Time spent in conversation: the learner's speech, the tutor's voice and the pauses before answering. */
  conversationMs: number;
  goalsCovered: number;
  selfCorrections: number;
  /** The session beat the learner's best words a minute. */
  personalRecord: boolean;
}

export function xpForSession(session: SessionAchievements): XpAward[] {
  const counts: Record<XpReason, number> = {
    practice_minute: Math.floor(session.conversationMs / 60_000),
    goal_covered: session.goalsCovered,
    self_corrected: session.selfCorrections,
    personal_record: session.personalRecord ? 1 : 0,
  };
  return XP_REASONS.filter((reason) => counts[reason] > 0).map((reason) => ({
    reason,
    count: counts[reason],
    points: counts[reason] * XP_POINTS[reason],
  }));
}

/** A record needs earlier sessions to beat; the first measured sessions only set the bar. */
export const RECORD_MIN_EARLIER_SESSIONS = 3;

export function isPersonalRecord(wordsPerMinute: number | null, earlierWordsPerMinute: number[]): boolean {
  if (wordsPerMinute === null || earlierWordsPerMinute.length < RECORD_MIN_EARLIER_SESSIONS) return false;
  return wordsPerMinute > Math.max(...earlierWordsPerMinute);
}

/** A calendar day in the learner's time zone, as YYYY-MM-DD. */
export type LocalDay = string;

export function localDay(at: Date, timeZone: string): LocalDay {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function previousDay(day: LocalDay): LocalDay {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function daysBetween(later: LocalDay, earlier: LocalDay): number {
  return Math.round((Date.parse(`${later}T12:00:00Z`) - Date.parse(`${earlier}T12:00:00Z`)) / 86_400_000);
}

/** One missed day is forgiven in any 7 days, so the streak never turns into pressure. */
export const STREAK_DAYS_OFF_PER_WEEK = 1;

/**
 * Days in a row with the daily goal met, counted back from today.
 * Today counts when its goal is already met; an unmet today is not a miss yet (the day is not over).
 * A missed day is forgiven when no other day was forgiven in the 6 days after it; forgiven days add nothing.
 * A second miss within those 7 days ends the streak.
 */
export function streakDays(metDays: ReadonlySet<LocalDay>, today: LocalDay): number {
  if (metDays.size === 0) return 0;
  const firstMet = [...metDays].sort()[0];
  let streak = metDays.has(today) ? 1 : 0;
  let lastForgiven: LocalDay | null = null;
  for (let day = previousDay(today); day >= firstMet; day = previousDay(day)) {
    if (metDays.has(day)) {
      streak += 1;
    } else if (lastForgiven === null || daysBetween(lastForgiven, day) >= 7) {
      lastForgiven = day;
    } else {
      break;
    }
  }
  return streak;
}
