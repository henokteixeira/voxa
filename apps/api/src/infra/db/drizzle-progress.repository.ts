import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { parseDailyMinutes, parseXpReason, XP_REASONS } from "../../domain/progress/daily-goal.js";
import type {
  DailyMinutesSetting,
  ProgressRepository,
  SessionXpRecord,
} from "../../domain/ports/progress.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { LEARNER_ID } from "./learner.js";
import { dailyGoalSettings, sessionXp, xpAwards } from "./schema.js";

@Injectable()
export class DrizzleProgressRepository implements ProgressRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARNER_ID) private readonly learnerId: string,
  ) {}

  async setDailyMinutes(language: string, setting: DailyMinutesSetting): Promise<void> {
    await this.db.insert(dailyGoalSettings).values({ language, ...setting, learnerId: this.learnerId });
  }

  async dailyMinutesHistory(language: string): Promise<DailyMinutesSetting[]> {
    const rows = await this.db
      .select({ minutesPerDay: dailyGoalSettings.minutesPerDay, setAt: dailyGoalSettings.setAt })
      .from(dailyGoalSettings)
      .where(eq(dailyGoalSettings.language, language))
      .orderBy(asc(dailyGoalSettings.seq));
    return rows.map((row) => ({ minutesPerDay: parseDailyMinutes(row.minutesPerDay), setAt: row.setAt }));
  }

  async awardOnce(record: SessionXpRecord): Promise<SessionXpRecord> {
    await this.db.transaction(async (tx) => {
      // The header decides: only the first end of a session inserts it, and only that one adds the reasons.
      const inserted = await tx
        .insert(sessionXp)
        .values({
          sessionId: record.sessionId,
          language: record.language,
          total: record.total,
          wordsPerMinute: record.wordsPerMinute,
          awardedAt: record.awardedAt,
        })
        .onConflictDoNothing()
        .returning({ sessionId: sessionXp.sessionId });
      if (inserted.length === 0 || record.awards.length === 0) return;
      await tx.insert(xpAwards).values(record.awards.map((award) => ({ sessionId: record.sessionId, ...award })));
    });
    const stored = await this.forSession(record.sessionId);
    if (!stored) throw new Error(`XP of session ${record.sessionId} was not stored.`);
    return stored;
  }

  async forSession(sessionId: string): Promise<SessionXpRecord | null> {
    const [header] = await this.db.select().from(sessionXp).where(eq(sessionXp.sessionId, sessionId));
    if (!header) return null;
    const rows = await this.db
      .select({ reason: xpAwards.reason, count: xpAwards.count, points: xpAwards.points })
      .from(xpAwards)
      .where(eq(xpAwards.sessionId, sessionId));
    const awards = rows
      .map((row) => ({ ...row, reason: parseXpReason(row.reason) }))
      .sort((a, b) => XP_REASONS.indexOf(a.reason) - XP_REASONS.indexOf(b.reason));
    return { ...header, awards };
  }

  async earnedSince(language: string, since: Date): Promise<{ total: number; awardedAt: Date }[]> {
    return this.db
      .select({ total: sessionXp.total, awardedAt: sessionXp.awardedAt })
      .from(sessionXp)
      .where(and(eq(sessionXp.language, language), gte(sessionXp.awardedAt, since)))
      .orderBy(asc(sessionXp.awardedAt));
  }

  async pacesBefore(language: string, before: Date): Promise<number[]> {
    const rows = await this.db
      .select({ pace: sessionXp.wordsPerMinute })
      .from(sessionXp)
      .where(and(eq(sessionXp.language, language), lte(sessionXp.awardedAt, before), isNotNull(sessionXp.wordsPerMinute)));
    return rows.flatMap((row) => (row.pace === null ? [] : [row.pace]));
  }
}
