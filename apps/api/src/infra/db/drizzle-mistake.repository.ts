import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, isNull, max, ne, sql } from "drizzle-orm";
import type { Severity } from "../../domain/conversation/types.js";
import type { KnownPattern, MistakePattern } from "../../domain/mistakes/pattern.js";
import type { BankEntry, DismissReason, MistakeBankRepository } from "../../domain/ports/mistake-bank.repository.js";
import type { Mistake, MistakeRepository, NewMistake, SessionMistake } from "../../domain/ports/mistake.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { mistakeCorrectUses, mistakeOccurrences, mistakes, patterns } from "./schema.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

@Injectable()
export class DrizzleMistakeRepository implements MistakeRepository, MistakeBankRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(m: NewMistake, occurrence: { sessionId: string; severity: Severity }): Promise<Mistake | null> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(mistakes)
        .where(and(eq(mistakes.language, m.language), eq(mistakes.original, m.original)))
        .limit(1);

      // A dismissed mistake left the bank for good: it does not count again.
      if (existing?.dismissedAt) return null;

      const { pattern, ...fields } = m;
      // A mistake keeps the first pattern it was given: later ones may word the same rule differently.
      const patternId = existing?.patternId ?? (pattern ? await this.patternId(tx, m.language, m.category, pattern) : null);
      const [saved] = existing
        ? await tx
            .update(mistakes)
            .set({
              occurrences: sql`${mistakes.occurrences} + 1`,
              lastSeenAt: new Date(),
              correction: m.correction,
              // The newest reading wins, so an older, broader category (grammar) gives way to the type.
              category: m.category,
              patternId,
            })
            .where(eq(mistakes.id, existing.id))
            .returning()
        : await tx.insert(mistakes).values({ ...fields, patternId }).returning();

      await tx.insert(mistakeOccurrences).values({ mistakeId: saved.id, language: m.language, ...occurrence });
      // Making it again sends it back to Open.
      await tx.delete(mistakeCorrectUses).where(eq(mistakeCorrectUses.mistakeId, saved.id));
      return toMistake(saved);
    });
  }

  /** The pattern's id, saved the first time it shows up; later mistakes with the same key join it as it is. */
  private async patternId(tx: Transaction, language: string, category: string, p: MistakePattern): Promise<string> {
    await tx.insert(patterns).values({ language, category, key: p.key, name: p.name, rule: p.rule }).onConflictDoNothing();
    const [row] = await tx
      .select({ id: patterns.id })
      .from(patterns)
      .where(and(eq(patterns.language, language), eq(patterns.key, p.key)))
      .limit(1);
    return row.id;
  }

  async recordCorrectUse(sessionId: string, mistake: { language: string; original: string }): Promise<Mistake | null> {
    return this.db.transaction(async (tx) => {
    const [found] = await tx
      .select()
      .from(mistakes)
      .where(
        and(eq(mistakes.language, mistake.language), eq(mistakes.original, mistake.original), isNull(mistakes.dismissedAt)),
      )
      .limit(1);
    if (!found) return null;
    // Only a session after the mistake counts.
    const [madeHere] = await tx
      .select({ id: mistakeOccurrences.id })
      .from(mistakeOccurrences)
      .where(and(eq(mistakeOccurrences.mistakeId, found.id), eq(mistakeOccurrences.sessionId, sessionId)))
      .limit(1);
    if (madeHere) return null;
    await tx
      .insert(mistakeCorrectUses)
      .values({ mistakeId: found.id, sessionId, language: mistake.language })
      .onConflictDoNothing();
    return toMistake(found);
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
        patternId: mistakes.patternId,
        ...patternColumns,
      })
      .from(mistakeOccurrences)
      .innerJoin(mistakes, eq(mistakeOccurrences.mistakeId, mistakes.id))
      .leftJoin(patterns, eq(mistakes.patternId, patterns.id))
      .where(and(eq(mistakeOccurrences.sessionId, sessionId), isNull(mistakes.dismissedAt)))
      .orderBy(asc(mistakeOccurrences.seq));
    const seenBefore = await this.patternsSeenOutside(sessionId, rows.map((r) => r.patternId));
    return rows.map(({ patternKey, patternName, patternRule, ...r }) => ({
      ...r,
      severity: r.severity === "serious" ? "serious" : "minor",
      pattern: toPattern(patternKey, patternName, patternRule),
      patternSeenBefore: r.patternId !== null && seenBefore.has(r.patternId),
    }));
  }

  /** Which of these patterns were broken in a session other than this one. */
  private async patternsSeenOutside(sessionId: string, patternIds: (string | null)[]): Promise<Set<string>> {
    const ids = [...new Set(patternIds.filter((id): id is string => id !== null))];
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .selectDistinct({ patternId: mistakes.patternId })
      .from(mistakeOccurrences)
      .innerJoin(mistakes, eq(mistakeOccurrences.mistakeId, mistakes.id))
      .where(and(inArray(mistakes.patternId, ids), ne(mistakeOccurrences.sessionId, sessionId)));
    return new Set(rows.flatMap((r) => (r.patternId ? [r.patternId] : [])));
  }

  async patterns(language: string, limit: number): Promise<KnownPattern[]> {
    return this.db
      .select({ key: patterns.key, name: patterns.name })
      .from(patterns)
      .innerJoin(mistakes, eq(mistakes.patternId, patterns.id))
      .where(and(eq(patterns.language, language), isNull(mistakes.dismissedAt)))
      .groupBy(patterns.id)
      .orderBy(desc(max(mistakes.lastSeenAt)), asc(patterns.key))
      .limit(limit);
  }

  async list(language: string): Promise<BankEntry[]> {
    const rows = await this.db
      .select({ mistake: mistakes, ...patternColumns })
      .from(mistakes)
      .leftJoin(patterns, eq(mistakes.patternId, patterns.id))
      .where(and(eq(mistakes.language, language), isNull(mistakes.dismissedAt)))
      .orderBy(desc(mistakes.lastSeenAt), desc(mistakes.id));
    if (rows.length === 0) return [];

    const uses = await this.db
      .select({ mistakeId: mistakeCorrectUses.mistakeId, sessions: count() })
      .from(mistakeCorrectUses)
      .where(
        inArray(
          mistakeCorrectUses.mistakeId,
          rows.map((r) => r.mistake.id),
        ),
      )
      .groupBy(mistakeCorrectUses.mistakeId);
    const correct = new Map(uses.map((u) => [u.mistakeId, Number(u.sessions)]));

    return rows.map(({ mistake, patternKey, patternName, patternRule }) => ({
      ...toMistake(mistake),
      sessionsCorrect: correct.get(mistake.id) ?? 0,
      pattern: toPattern(patternKey, patternName, patternRule),
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

const patternColumns = { patternKey: patterns.key, patternName: patterns.name, patternRule: patterns.rule };

function toPattern(key: string | null, name: string | null, rule: string | null): MistakePattern | null {
  return key === null || name === null || rule === null ? null : { key, name, rule };
}

function toMistake(row: typeof mistakes.$inferSelect): Mistake {
  const { id, language, original, correction, category, occurrences, lastSeenAt, patternId } = row;
  return { id, language, original, correction, category, occurrences, lastSeenAt, patternId };
}
