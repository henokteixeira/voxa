import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, min, or, type SQL, sql } from "drizzle-orm";
import { NEW_WORD_CATEGORY } from "../../domain/conversation/types.js";
import type { AnsweredCard, ReviewItem, ReviewRepository, ReviewSchedule, ReviewSubject, StoredReviewCard } from "../../domain/ports/review.repository.js";
import type { ReviewState } from "../../domain/review/review-schedule.js";
import { DATABASE, type Database } from "./db.module.js";
import { mistakes, patterns, reviewCards, reviewItems } from "./schema.js";

/** How many of a pattern's sentences a review shows. */
const EXAMPLES_PER_PATTERN = 3;

@Injectable()
export class DrizzleReviewRepository implements ReviewRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async state(subject: ReviewSubject): Promise<ReviewState | null> {
    const [row] = await this.db
      .select({ step: reviewItems.step, dueAt: reviewItems.dueAt })
      .from(reviewItems)
      .where(subjectIs(subject))
      .limit(1);
    return row ?? null;
  }

  async save(language: string, subject: ReviewSubject, state: ReviewState, reviewedAt: Date | null): Promise<void> {
    const values = { step: state.step, dueAt: state.dueAt, ...(reviewedAt ? { lastReviewedAt: reviewedAt } : {}) };
    await this.db
      .insert(reviewItems)
      .values({ language, ...subjectColumns(subject), ...values })
      .onConflictDoUpdate({ target: subject.kind === "pattern" ? reviewItems.patternId : reviewItems.newWordId, set: values });
  }

  async due(language: string, now: Date, limit: number): Promise<ReviewItem[]> {
    const items = await this.items(and(eq(reviewItems.language, language), lte(reviewItems.dueAt, now)));
    return items.slice(0, limit);
  }

  async item(subject: ReviewSubject): Promise<ReviewItem | null> {
    const [item] = await this.items(subjectIs(subject));
    return item ?? null;
  }

  /** The matching items, the longest overdue first, without dismissed words and patterns left with no mistakes. */
  private async items(where: SQL | undefined): Promise<ReviewItem[]> {
    const rows = await this.db
      .select({ item: reviewItems, pattern: patterns, word: mistakes })
      .from(reviewItems)
      .leftJoin(patterns, eq(reviewItems.patternId, patterns.id))
      .leftJoin(mistakes, eq(reviewItems.newWordId, mistakes.id))
      .where(and(where, isNull(mistakes.dismissedAt)))
      .orderBy(asc(reviewItems.dueAt), asc(reviewItems.id));

    const patternIds = rows.flatMap((r) => (r.pattern ? [r.pattern.id] : []));
    const sentences = patternIds.length
      ? await this.db
          .select({ patternId: mistakes.patternId, original: mistakes.original, correction: mistakes.correction })
          .from(mistakes)
          .where(and(inArray(mistakes.patternId, patternIds), isNull(mistakes.dismissedAt)))
          .orderBy(desc(mistakes.lastSeenAt), desc(mistakes.id))
      : [];

    const items: ReviewItem[] = [];
    for (const { item, pattern, word } of rows) {
      const base = { language: item.language, step: item.step, dueAt: item.dueAt };
      if (pattern) {
        const examples = sentences
          .filter((s) => s.patternId === pattern.id)
          .slice(0, EXAMPLES_PER_PATTERN)
          .map(({ original, correction }) => ({ original, correction }));
        // A pattern whose every mistake was dismissed is not reviewed.
        if (examples.length === 0) continue;
        items.push({ ...base, subject: { kind: "pattern", id: pattern.id }, category: pattern.category, name: pattern.name, rule: pattern.rule, examples });
      } else if (word) {
        const examples = [{ original: word.original, correction: word.correction }];
        items.push({ ...base, subject: { kind: "new_word", id: word.id }, category: NEW_WORD_CATEGORY, name: word.correction, rule: word.original, examples });
      }
    }
    return items;
  }

  async addCard(subject: ReviewSubject, cue: { cue: string; answer: string }): Promise<StoredReviewCard> {
    const [item] = await this.db
      .select({ id: reviewItems.id, language: reviewItems.language })
      .from(reviewItems)
      .where(subjectIs(subject))
      .limit(1);
    if (!item) throw new Error(`No review item for ${subject.kind} ${subject.id}.`);
    const [row] = await this.db
      .insert(reviewCards)
      .values({ language: item.language, reviewItemId: item.id, cue: cue.cue, answer: cue.answer })
      .returning();
    return { id: row.id, subject, cue: row.cue, answer: row.answer, recalled: null };
  }

  async card(id: string): Promise<StoredReviewCard | null> {
    const [row] = await this.db
      .select({ card: reviewCards, patternId: reviewItems.patternId, newWordId: reviewItems.newWordId })
      .from(reviewCards)
      .innerJoin(reviewItems, eq(reviewCards.reviewItemId, reviewItems.id))
      .where(eq(reviewCards.id, id))
      .limit(1);
    if (!row) return null;
    const subject: ReviewSubject = row.patternId
      ? { kind: "pattern", id: row.patternId }
      : { kind: "new_word", id: row.newWordId! };
    return { id: row.card.id, subject, cue: row.card.cue, answer: row.card.answer, recalled: row.card.recalled };
  }

  async answerCard(id: string, recalled: boolean, at: Date): Promise<boolean> {
    const updated = await this.db
      .update(reviewCards)
      .set({ recalled, answeredAt: at })
      .where(and(eq(reviewCards.id, id), isNull(reviewCards.answeredAt)))
      .returning({ id: reviewCards.id });
    return updated.length > 0;
  }

  async answeredSince(language: string, since: Date): Promise<AnsweredCard[]> {
    const rows = await this.db
      .select({ cardId: reviewCards.id, itemId: reviewCards.reviewItemId, answeredAt: reviewCards.answeredAt })
      .from(reviewCards)
      .where(and(eq(reviewCards.language, language), gte(reviewCards.answeredAt, since)))
      .orderBy(asc(reviewCards.answeredAt));
    return rows.flatMap(({ cardId, itemId, answeredAt }) => (answeredAt ? [{ cardId, itemId, answeredAt }] : []));
  }

  async schedules(language: string): Promise<ReviewSchedule[]> {
    const rows = await this.db
      .select({ patternId: reviewItems.patternId, newWordId: reviewItems.newWordId, step: reviewItems.step, dueAt: reviewItems.dueAt })
      .from(reviewItems)
      .where(eq(reviewItems.language, language));
    return rows.flatMap(({ patternId, newWordId, step, dueAt }): ReviewSchedule[] => {
      // The table's check keeps exactly one of the two set.
      if (patternId) return [{ subject: { kind: "pattern", id: patternId }, step, dueAt }];
      return newWordId ? [{ subject: { kind: "new_word", id: newWordId }, step, dueAt }] : [];
    });
  }

  async nextDueAt(language: string, now: Date): Promise<Date | null> {
    const [row] = await this.db
      .select({ next: min(reviewItems.dueAt) })
      .from(reviewItems)
      .leftJoin(mistakes, eq(reviewItems.newWordId, mistakes.id))
      .where(
        and(
          eq(reviewItems.language, language),
          gt(reviewItems.dueAt, now),
          or(
            and(isNull(reviewItems.patternId), isNull(mistakes.dismissedAt)),
            // A pattern counts while one of its mistakes is still in the bank.
            sql`exists (select 1 from ${mistakes} m where m.pattern_id = ${reviewItems.patternId} and m.dismissed_at is null)`,
          ),
        ),
      );
    return row?.next ?? null;
  }
}

function subjectColumns(subject: ReviewSubject) {
  return subject.kind === "pattern" ? { patternId: subject.id } : { newWordId: subject.id };
}

function subjectIs(subject: ReviewSubject) {
  return subject.kind === "pattern" ? eq(reviewItems.patternId, subject.id) : eq(reviewItems.newWordId, subject.id);
}
