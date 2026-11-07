import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, isNotNull, ne } from "drizzle-orm";
import type { SessionTiming } from "../../domain/conversation/fluency.js";
import { type DailyMinutes, XP_REASONS, type XpAward, type XpReason } from "../../domain/progress/daily-goal.js";
import type { DailyMinutesSetting, EarnedXp, ProgressRepository } from "../../domain/ports/progress.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { dailyGoalSettings, sessions, xpAwards } from "./schema.js";

@Injectable()
export class DrizzleProgressRepository implements ProgressRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async setDailyMinutes(language: string, setting: DailyMinutesSetting): Promise<void> {
    await this.db.insert(dailyGoalSettings).values({ language, ...setting });
  }

  async dailyMinutesHistory(language: string): Promise<DailyMinutesSetting[]> {
    const rows = await this.db
      .select({ minutesPerDay: dailyGoalSettings.minutesPerDay, setAt: dailyGoalSettings.setAt })
      .from(dailyGoalSettings)
      .where(eq(dailyGoalSettings.language, language))
      .orderBy(asc(dailyGoalSettings.seq));
    return rows.map((row) => ({ minutesPerDay: row.minutesPerDay as DailyMinutes, setAt: row.setAt }));
  }

  async award(sessionId: string, language: string, awards: XpAward[], earnedAt: Date): Promise<void> {
    if (awards.length === 0) return;
    await this.db
      .insert(xpAwards)
      .values(awards.map((award) => ({ sessionId, language, ...award, earnedAt })))
      .onConflictDoNothing();
  }

  async awardsFor(sessionId: string): Promise<XpAward[]> {
    const rows = await this.db
      .select({ reason: xpAwards.reason, count: xpAwards.count, points: xpAwards.points })
      .from(xpAwards)
      .where(eq(xpAwards.sessionId, sessionId));
    const order = (reason: string) => XP_REASONS.indexOf(reason as XpReason);
    return rows
      .map((row) => ({ ...row, reason: row.reason as XpReason }))
      .sort((a, b) => order(a.reason) - order(b.reason));
  }

  async earnedSince(language: string, since: Date): Promise<EarnedXp[]> {
    return this.db
      .select({ points: xpAwards.points, earnedAt: xpAwards.earnedAt })
      .from(xpAwards)
      .where(and(eq(xpAwards.language, language), gte(xpAwards.earnedAt, since)))
      .orderBy(asc(xpAwards.earnedAt));
  }

  async otherTimings(language: string, sessionId: string): Promise<SessionTiming[]> {
    const rows = await this.db
      .select({ timing: sessions.timing })
      .from(sessions)
      .where(and(eq(sessions.language, language), ne(sessions.id, sessionId), isNotNull(sessions.timing)));
    return rows.flatMap((row) => (row.timing ? [row.timing] : []));
  }
}
