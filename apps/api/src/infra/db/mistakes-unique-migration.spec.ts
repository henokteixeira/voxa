import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db.module.js";
import { DrizzleMistakeRepository } from "./drizzle-mistake.repository.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { mistakeCorrectUses, mistakeOccurrences, mistakes, reviewItems } from "./schema.js";
import { createTestDatabase } from "./test-database.js";

/** The migration's statements, run again on rows saved as they were before it. */
const MIGRATION = readFileSync(resolve(__dirname, "../../../drizzle/0028_mistakes_unique_original.sql"), "utf8")
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

let db: Database;
let learnerId: string;
let close: () => Promise<void>;
let sessionId: string;

beforeEach(async () => {
  ({ db, learnerId, close } = await createTestDatabase());
  await db.execute(sql`ALTER TABLE "mistakes" DROP CONSTRAINT "mistakes_learner_language_original"`);
  ({ id: sessionId } = await new DrizzleSessionRepository(db, learnerId).create({ language: "en", mode: "daily" }));
});
afterEach(() => close());

async function migrate() {
  await db.transaction(async (tx) => {
    for (const statement of MIGRATION) await tx.execute(sql.raw(statement));
  });
}

const row = (over: Partial<typeof mistakes.$inferInsert>) => ({
  learnerId,
  language: "en",
  original: "I goed",
  correction: "I went",
  category: "verb_tense",
  ...over,
});

describe("migration 0028: one row per mistake", () => {
  it("merges a mistake saved twice: counts, occurrences, correct uses and one review schedule", async () => {
    const [older, newer] = await db
      .insert(mistakes)
      .values([
        row({ occurrences: 2, lastSeenAt: new Date("2026-11-01T10:00:00Z"), category: "new_word" }),
        row({ occurrences: 1, lastSeenAt: new Date("2026-11-05T10:00:00Z"), category: "new_word" }),
      ])
      .returning();
    await db.insert(mistakeOccurrences).values([
      { mistakeId: older.id, sessionId, language: "en", severity: "minor" },
      { mistakeId: newer.id, sessionId, language: "en", severity: "minor" },
    ]);
    await db.insert(mistakeCorrectUses).values({ mistakeId: older.id, sessionId, language: "en" });
    await db.insert(reviewItems).values({ learnerId, language: "en", newWordId: older.id, step: 1, dueAt: new Date("2026-11-08T00:00:00Z") });

    await migrate();

    const kept = await db.select().from(mistakes);
    expect(kept).toEqual([expect.objectContaining({ id: newer.id, occurrences: 3 })]);
    expect((await db.select().from(mistakeOccurrences)).map((o) => o.mistakeId)).toEqual([newer.id, newer.id]);
    expect((await db.select().from(mistakeCorrectUses)).map((u) => u.mistakeId)).toEqual([newer.id]);
    expect((await db.select().from(reviewItems)).map((r) => r.newWordId)).toEqual([newer.id]);
  });

  it("keeps the dismissed row, so the learner's choice stands", async () => {
    const [dismissed] = await db
      .insert(mistakes)
      .values([row({ dismissedAt: new Date("2026-11-02T10:00:00Z"), lastSeenAt: new Date("2026-11-01T10:00:00Z") }), row({})])
      .returning();

    await migrate();

    expect((await db.select().from(mistakes)).map((m) => m.id)).toEqual([dismissed.id]);
  });

  it("leaves distinct mistakes alone, then refuses a second row for the same one", async () => {
    await db.insert(mistakes).values([row({}), row({ original: "I buyed" }), row({ language: "es" })]);

    await migrate();

    expect(await db.select().from(mistakes)).toHaveLength(3);
    await expect(db.insert(mistakes).values(row({}))).rejects.toThrow();
  });
});

describe("DrizzleMistakeRepository.record after the migration", () => {
  it("counts the same mistake recorded by two turns at once on one row", async () => {
    await migrate();
    // Back to the constraint as it is now: one row per mistake for each learner.
    await db.execute(sql`ALTER TABLE "mistakes" DROP CONSTRAINT "mistakes_language_original"`);
    await db.execute(
      sql`ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_learner_language_original" UNIQUE ("learner_id", "language", "original")`,
    );
    const repository = new DrizzleMistakeRepository(db, learnerId);
    const mistake = { language: "en", original: "I goed", correction: "I went", category: "verb_tense", pattern: null };

    await Promise.all([
      repository.record(mistake, { sessionId, severity: "minor" }),
      repository.record(mistake, { sessionId, severity: "minor" }),
    ]);

    expect(await db.select().from(mistakes)).toEqual([expect.objectContaining({ occurrences: 2 })]);
    expect(await db.select().from(mistakeOccurrences)).toHaveLength(2);
  });
});
