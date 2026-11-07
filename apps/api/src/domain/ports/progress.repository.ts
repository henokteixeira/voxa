import type { DailyMinutes, XpAward } from "../progress/daily-goal.js";

export interface DailyMinutesSetting {
  minutesPerDay: DailyMinutes;
  setAt: Date;
}

/** The XP of one ended session. */
export interface SessionXpRecord {
  sessionId: string;
  language: string;
  awards: XpAward[];
  total: number;
  /** The session's pace, kept to find personal records; null when not measured. */
  wordsPerMinute: number | null;
  awardedAt: Date;
}

/** XP and the daily practice time, per language. */
export interface ProgressRepository {
  setDailyMinutes(language: string, setting: DailyMinutesSetting): Promise<void>;
  /** Every setting, oldest first. */
  dailyMinutesHistory(language: string): Promise<DailyMinutesSetting[]>;
  /**
   * Stores a session's XP, atomically, unless the session already has XP (ending twice, or two ends racing).
   * Returns the XP stored for the session either way.
   */
  awardOnce(record: SessionXpRecord): Promise<SessionXpRecord>;
  /** The XP a session earned, or null before it was awarded. */
  forSession(sessionId: string): Promise<SessionXpRecord | null>;
  /** Total XP of each session awarded since a moment, oldest first. */
  earnedSince(language: string, since: Date): Promise<{ total: number; awardedAt: Date }[]>;
  /** Paces of the sessions awarded up to a moment (the session being awarded is not stored yet). */
  pacesBefore(language: string, before: Date): Promise<number[]>;
}

export const PROGRESS_REPOSITORY = Symbol("PROGRESS_REPOSITORY");
