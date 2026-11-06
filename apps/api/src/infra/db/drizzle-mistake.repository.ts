import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Severity } from "../../domain/conversation/types.js";
import type { BankEntry, DismissReason, MistakeBankRepository } from "../../domain/ports/mistake-bank.repository.js";
import type { Mistake, MistakeRepository, NewMistake, SessionMistake } from "../../domain/ports/mistake.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { mistakeCorrectUses, mistakeOccurrences, mistakes } from "./schema.js";

@Injectable()
export class DrizzleMistakeRepository implements MistakeRepository, MistakeBankRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(m: NewMistake, occurrence: { sessionId: string; severity: Severity }): Promise<Mistake> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(mistakes)
        .where(and(eq(mistakes.language, m.language), eq(mistakes.original, m.original)))
        .limit(1);

      // A dismissed mistake left the bank for good: it does not count again.
      if (existing?.dismissedAt) return toMistake(existing);

      const [saved] = existing
        ? await tx
            .update(mistakes)
            .set({ occurrences: sql`${mistakes.occurrences} + 1`, lastSeenAt: new Date(), correction: m.correction })
            .where(eq(mistakes.id, existing.id))
            .returning()
        : await tx.insert(mistakes).values(m).returning();

      await tx.insert(mistakeOccurrences).values({ mistakeId: saved.id, language: m.language, ...occurrence });
      // Making it again sends it back to Open.
      await tx.delete(mistakeCorrectUses).where(eq(mistakeCorrectUses.mistakeId, saved.id));
      return toMistake(saved);
    });
  }

  async recordCorrectUse(sessionId: string, mistake: { language: string; original: string }): Promise<void> {
    await this.db.transaction(async (tx) => {
    const [found] = await tx
      .select({ id: mistakes.id })
      .from(mistakes)
      .where(
        and(eq(mistakes.language, mistake.language), eq(mistakes.original, mistake.original), isNull(mistakes.dismissedAt)),
      )
      .limit(1);
    if (!found) return;
    // Only a session after the mistake counts.
    const [madeHere] = await tx
      .select({ id: mistakeOccurrences.id })
      .from(mistakeOccurrences)
      .where(and(eq(mistakeOccurrences.mistakeId, found.id), eq(mistakeOccurrences.sessionId, sessionId)))
      .limit(1);
    if (madeHere) return;
    await tx
      .insert(mistakeCorrectUses)
      .values({ mistakeId: found.id, sessionId, language: mistake.language })
      .onConflictDoNothing();
    });
  }

  async markSelfCorrected(sessionId: string, mistake: { language: string; original: string }): Promise<void> {
    const [latest] = await this.db
      .select({ id: mistakeOccurrences.id })
      .from(mistakeOccurrences)
      .innerJoin(mistakes, eq(mistakeOccurrences.mistakeId, mistakes.id))
      .where(
        and(
          eq(mistakeOccurrences.sessionId, sessionId),
          eq(mistakes.language, mistake.language),
          eq(mistakes.original, mistake.original),
        ),
      )
      .orderBy(desc(mistakeOccurrences.seq))
      .limit(1);
    if (!latest) return;
    await this.db.update(mistakeOccurrences).set({ selfCorrected: true }).where(eq(mistakeOccurrences.id, latest.id));
  }

  async mostFrequent(language: string, limit: number): Promise<Mistake[]> {
    const rows = await this.db
      .select()
      .from(mistakes)
      .where(and(eq(mistakes.language, language), isNull(mistakes.dismissedAt)))
      .orderBy(desc(mistakes.occurrences), desc(mistakes.lastSeenAt))
      .limit(limit);
    return rows.map(toMistake);
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
      .where(and(eq(mistakeOccurrences.sessionId, sessionId), isNull(mistakes.dismissedAt)))
      .orderBy(asc(mistakeOccurrences.seq));
    return rows.map((r) => ({ ...r, severity: r.severity === "serious" ? "serious" : "minor" }));
  }

  async list(language: string): Promise<BankEntry[]> {
    const rows = await this.db
      .select()
      .from(mistakes)
      .where(and(eq(mistakes.language, language), isNull(mistakes.dismissedAt)))
      .orderBy(desc(mistakes.lastSeenAt), desc(mistakes.id));
    if (rows.length === 0) return [];

    const uses = await this.db
      .select({ mistakeId: mistakeCorrectUses.mistakeId, sessions: count() })
      .from(mistakeCorrectUses)
      .where(
        inArray(
          mistakeCorrectUses.mistakeId,
          rows.map((r) => r.id),
        ),
      )
      .groupBy(mistakeCorrectUses.mistakeId);
    const correct = new Map(uses.map((u) => [u.mistakeId, Number(u.sessions)]));

    return rows.map((r) => ({ ...toMistake(r), sessionsCorrect: correct.get(r.id) ?? 0 }));
  }

  async dismiss(id: string, reason: DismissReason): Promise<boolean> {
    const updated = await this.db
      .update(mistakes)
      .set({ dismissedAt: new Date(), dismissReason: reason })
      .where(eq(mistakes.id, id))
      .returning({ id: mistakes.id });
    return updated.length > 0;
  }
}

function toMistake(row: typeof mistakes.$inferSelect): Mistake {
  const { id, language, original, correction, category, occurrences, lastSeenAt } = row;
  return { id, language, original, correction, category, occurrences, lastSeenAt };
}
