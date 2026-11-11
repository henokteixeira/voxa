import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db.module.js";
import { DrizzleLevelRepository } from "./drizzle-level.repository.js";
import { DrizzleMissionRepository } from "./drizzle-mission.repository.js";
import { DrizzleMistakeRepository } from "./drizzle-mistake.repository.js";
import { DrizzleReviewRepository } from "./drizzle-review.repository.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { learners } from "./schema.js";
import { createTestDatabase } from "./test-database.js";

let db: Database;
let learnerId: string;
let otherId: string;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, learnerId, close } = await createTestDatabase());
  // A second learner, as login will bring; the API itself still refuses to start with two.
  [{ id: otherId }] = await db.insert(learners).values({}).returning({ id: learners.id });
});
afterEach(() => close());

describe("each learner sees only their own records", () => {
  it("keeps sessions, mistakes, reviews, levels and missions apart", async () => {
    const mine = new DrizzleSessionRepository(db, learnerId);
    const theirs = new DrizzleSessionRepository(db, otherId);
    const session = await theirs.create({ language: "en", mode: "daily" });
    const mistake = { language: "en", original: "I goed", correction: "I went", category: "verb_tense", pattern: null };
    const word = await new DrizzleMistakeRepository(db, otherId).record(mistake, { sessionId: session.id, severity: "minor" });
    await new DrizzleReviewRepository(db, otherId).save("en", { kind: "new_word", id: word!.id }, { step: 0, dueAt: new Date(0) }, null);
    await new DrizzleLevelRepository(db, otherId).add({ language: "en", level: "B1", source: "manual", evidence: [], assessedAt: new Date() });
    const mission = await new DrizzleMissionRepository(db, otherId).create({ language: "en", day: "2026-11-11", situation: "daily", createdAt: new Date() });

    expect(await mine.get(session.id)).toBeNull();
    expect(await mine.claimTurn(session.id, 0)).toBe("ended");
    expect(await new DrizzleMistakeRepository(db, learnerId).list("en")).toEqual([]);
    expect(await new DrizzleReviewRepository(db, learnerId).due("en", new Date(), 10)).toEqual([]);
    expect(await new DrizzleLevelRepository(db, learnerId).current("en")).toBeNull();
    const missions = new DrizzleMissionRepository(db, learnerId);
    expect(await missions.get(mission.id)).toBeNull();
    // The same day's mission is each learner's own.
    expect((await missions.create({ language: "en", day: "2026-11-11", situation: "story", createdAt: new Date() })).id).not.toBe(mission.id);
  });

  it("counts the same mistake once per learner", async () => {
    const mistake = { language: "en", original: "I goed", correction: "I went", category: "verb_tense", pattern: null };
    for (const id of [learnerId, otherId]) {
      const { id: sessionId } = await new DrizzleSessionRepository(db, id).create({ language: "en", mode: "daily" });
      await new DrizzleMistakeRepository(db, id).record(mistake, { sessionId, severity: "minor" });
    }

    const [saved] = await new DrizzleMistakeRepository(db, learnerId).list("en");
    expect(saved?.occurrences).toBe(1);
  });
});
