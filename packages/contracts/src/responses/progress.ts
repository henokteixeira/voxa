import type { DailyMinutes, XpReason } from "../values.js";

export interface XpAward {
  reason: XpReason;
  /** How many times it happened: minutes, goals, self-corrections, records. */
  count: number;
  points: number;
}

export interface SessionXp {
  awards: XpAward[];
  total: number;
}

/** Today's XP, goal and streak, in the learner's time zone. */
export interface TodayProgress {
  /** YYYY-MM-DD. */
  day: string;
  minutesPerDay: DailyMinutes;
  goalXp: number;
  earnedXp: number;
  goalMet: boolean;
  streakDays: number;
  /** XP for each reason, to show XP as it is earned. */
  points: Record<XpReason, number>;
}
