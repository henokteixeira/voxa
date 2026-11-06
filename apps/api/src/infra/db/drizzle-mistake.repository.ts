import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Severity } from "../../domain/conversation/types.js";
import type { Mistake, MistakeRepository, NewMistake, SessionMistake } from "../../domain/ports/mistake.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { mistakeOccurrences, mistakes } from "./schema.js";

@Injectable()
export class DrizzleMistakeRepository implements MistakeRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(m: NewMistake, occurrence: { sessionId: string; severity: Severity }): Promise<Mistake> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(mistakes)
        .where(and(eq(mistakes.language, m.language), eq(mistakes.original, m.original)))
        .limit(1);

      const [saved] = existing
        ? await tx
            .update(mistakes)
            .set({ occurrences: sql`${mistakes.occurrences} + 1`, lastSeenAt: new Date(), correction: m.correction })
            .where(eq(mistakes.id, existing.id))
            .returning()
        : await tx.insert(mistakes).values(m).returning();

      await tx.insert(mistakeOccurrences).values({ mistakeId: saved.id, ...occurrence });
      return saved;
    });
  }

  async markSelfCorrected(sessionId: string, original: string): Promise<void> {
    const ids = this.db
      .select({ id: mistakes.id })
      .from(mistakes)
      .where(eq(mistakes.original, original));
    await this.db
      .update(mistakeOccurrences)
      .set({ selfCorrected: true })
      .where(and(eq(mistakeOccurrences.sessionId, sessionId), sql`${mistakeOccurrences.mistakeId} in ${ids}`));
  }

  mostFrequent(language: string, limit: number): Promise<Mistake[]> {
    return this.db
      .select()
      .from(mistakes)
      .where(eq(mistakes.language, language))
      .orderBy(desc(mistakes.occurrences), desc(mistakes.lastSeenAt))
      .limit(limit);
  }

  async forSession(sessionId: string): Promise<SessionMistake[]> {
    const rows = await this.db
      .select({
        original: mistakes.original,
        correction: mistakes.correction,
        category: mistakes.category,
        severity: mistakeOccurrences.severity,
        selfCorrected: mistakeOccurrences.selfCorrected,
        occurrences: mistakes.occurrences,
      })
      .from(mistakeOccurrences)
      .innerJoin(mistakes, eq(mistakeOccurrences.mistakeId, mistakes.id))
      .where(eq(mistakeOccurrences.sessionId, sessionId))
      .orderBy(asc(mistakeOccurrences.createdAt), asc(mistakeOccurrences.id));
    return rows.map((r) => ({ ...r, severity: r.severity === "serious" ? "serious" : "minor" }));
  }
}
