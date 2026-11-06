import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Severity } from "../../domain/conversation/types.js";
import type { BankEntry, DismissReason, MistakeBankRepository } from "../../domain/ports/mistake-bank.repository.js";
import type { Mistake, MistakeRepository, NewMistake, SessionMistake } from "../../domain/ports/mistake.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { mistakeOccurrences, mistakes, sessions, turns } from "./schema.js";

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
      return toMistake(saved);
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
    // Sessions in the same language, started after the session of the latest occurrence,
    // in which the learner spoke at least once.
    const sessionsSince = sql<number>`(
      select count(*)::int from ${sessions} s
      where s.language = "mistakes"."language"
        and s.started_at > (
          select s2.started_at from ${mistakeOccurrences} o
          join ${sessions} s2 on s2.id = o.session_id
          where o.mistake_id = "mistakes"."id"
          order by o.seq desc limit 1
        )
        and exists (select 1 from ${turns} t where t.session_id = s.id and t.role = 'user')
    )`;
    const rows = await this.db
      .select({ mistake: mistakes, sessionsSince })
      .from(mistakes)
      .where(and(eq(mistakes.language, language), isNull(mistakes.dismissedAt)))
      .orderBy(desc(mistakes.lastSeenAt), desc(mistakes.id));
    if (rows.length === 0) return [];

    const occurrences = await this.db
      .select({ mistakeId: mistakeOccurrences.mistakeId, selfCorrected: mistakeOccurrences.selfCorrected })
      .from(mistakeOccurrences)
      .where(
        inArray(
          mistakeOccurrences.mistakeId,
          rows.map((r) => r.mistake.id),
        ),
      )
      .orderBy(desc(mistakeOccurrences.seq));
    const fixed = new Map<string, boolean[]>();
    for (const o of occurrences) fixed.set(o.mistakeId, [...(fixed.get(o.mistakeId) ?? []), o.selfCorrected]);

    return rows.map((r) => ({
      ...toMistake(r.mistake),
      fixedByLearner: fixed.get(r.mistake.id) ?? [],
      sessionsSince: Number(r.sessionsSince ?? 0),
    }));
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
