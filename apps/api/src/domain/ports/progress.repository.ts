import type { SessionTiming } from "../conversation/fluency.js";
import type { DailyMinutes, XpAward } from "../progress/daily-goal.js";

export interface DailyMinutesSetting {
  minutesPerDay: DailyMinutes;
  setAt: Date;
}

export interface EarnedXp {
  points: number;
  earnedAt: Date;
}

/** XP, the daily practice time and what the record check needs, per language. */
export interface ProgressRepository {
  setDailyMinutes(language: string, setting: DailyMinutesSetting): Promise<void>;
  /** Every setting, oldest first. */
  dailyMinutesHistory(language: string): Promise<DailyMinutesSetting[]>;
  /** Stores a session's XP. A session that already has XP keeps it (ending twice awards once). */
  award(sessionId: string, language: string, awards: XpAward[], earnedAt: Date): Promise<void>;
  /** The XP a session earned, in the order of the reasons. */
  awardsFor(sessionId: string): Promise<XpAward[]>;
  /** XP earned since a moment, oldest first. */
  earnedSince(language: string, since: Date): Promise<EarnedXp[]>;
  /** Timing of the other ended sessions in the language, to compare paces. */
  otherTimings(language: string, sessionId: string): Promise<SessionTiming[]>;
}

export const PROGRESS_REPOSITORY = Symbol("PROGRESS_REPOSITORY");
