/**
 * XP, the daily goal and the streak (design approved on 2026-11-07: "Voxa: XP, daily goal and sounds").
 * The numbers are design choices to tune with real use, not research findings.
 * Making a mistake never takes XP away: XP only rewards practicing, trying and fixing.
 */

/** How long the learner wants to practice each day. */
export const DAILY_MINUTES = [15, 30, 45, 60] as const;
export type DailyMinutes = (typeof DAILY_MINUTES)[number];
export const DEFAULT_DAILY_MINUTES: DailyMinutes = 30;

/**
 * 1 XP a minute of conversation, so the goal is the chosen time. Bonuses stay small (about 10–20% of a session),
 * so they make the goal close a little early, never after a third of the time (changed on 2026-11-07 after real use).
 */
const GOAL_XP: Record<DailyMinutes, number> = { 15: 15, 30: 30, 45: 45, 60: 60 };

/** Reads a stored value back, failing loudly on data the domain does not know. */
export function parseDailyMinutes(value: number): DailyMinutes {
  if (!(DAILY_MINUTES as readonly number[]).includes(value)) throw new Error(`Unknown daily practice time: ${value}.`);
  return value as DailyMinutes;
}

export function dailyGoalXp(minutes: DailyMinutes): number {
  return GOAL_XP[minutes];
}

/** What earns XP. */
export const XP_REASONS = ["practice_minute", "goal_covered", "self_corrected", "personal_record"] as const;
export type XpReason = (typeof XP_REASONS)[number];

export function parseXpReason(value: string): XpReason {
  if (!(XP_REASONS as readonly string[]).includes(value)) throw new Error(`Unknown XP reason: ${value}.`);
  return value as XpReason;
}

/** XP for each time a reason happens. The web app reads this table from the API to show XP as it happens. */
export const XP_POINTS: Record<XpReason, number> = {
  practice_minute: 1,
  goal_covered: 1,
  // Fixing a mistake alone after a hint is worth more than any other moment.
  self_corrected: 2,
  personal_record: 3,
};

/**
 * XP for each answered review item, right or wrong (decided on 2026-11-07): about a minute of practice, like a minute
 * of conversation, and a miss is worth the same so the review never feels like a test.
 * An item earns it once a day: practicing it again is welcome, but does not move the goal again.
 */
export const XP_PER_REVIEW = 1;

/** The answered review cards that earn XP: each item's first answer of a local day. Expects them oldest first. */
export function cardsEarningXp<T extends { itemId: string; answeredAt: Date }>(answered: readonly T[], timeZone: string): T[] {
  const seen = new Set<string>();
  return answered.filter(({ itemId, answeredAt }) => {
    const key = `${itemId}:${localDay(answeredAt, timeZone)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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

/** Conversation time can't be longer than the session itself (the timing comes from the app). */
export function conversationMs(
  timing: { learnerSpeechMs: number; tutorSpeechMs: number; pausesMs: number[] } | null,
  sessionMs: number,
): number {
  if (!timing) return 0;
  const measured = timing.learnerSpeechMs + timing.tutorSpeechMs + timing.pausesMs.reduce((sum, ms) => sum + ms, 0);
  return Math.max(0, Math.min(measured, sessionMs));
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

/**
 * The goal a day is judged by: the newest setting made by the end of that day, or the default.
 * The same rule for today and for past days, so a day never changes after the fact.
 */
export function minutesForDay(
  history: readonly { minutesPerDay: DailyMinutes; setAt: Date }[],
  day: LocalDay,
  timeZone: string,
): DailyMinutes {
  let minutes = DEFAULT_DAILY_MINUTES;
  for (const setting of history) {
    if (localDay(setting.setAt, timeZone) <= day) minutes = setting.minutesPerDay;
  }
  return minutes;
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
