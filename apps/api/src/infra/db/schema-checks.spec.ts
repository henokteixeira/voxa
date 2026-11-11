import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db.module.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { mistakeOccurrences, mistakes, sessions, speakingLevels, turns } from "./schema.js";
import { createTestDatabase } from "./test-database.js";

let db: Database;
let learnerId: string;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, learnerId, close } = await createTestDatabase());
});
afterEach(() => close());

describe("schema checks", () => {
  it("keeps out a value the code does not know", async () => {
    await expect(db.insert(sessions).values({ learnerId, language: "en", mode: "karaoke" })).rejects.toThrow();
    const { id } = await new DrizzleSessionRepository(db, learnerId).create({ language: "en", mode: "daily" });
    await expect(db.insert(turns).values({ sessionId: id, role: "narrator", content: "Hi." })).rejects.toThrow();
    const [mistake] = await db.insert(mistakes).values({ learnerId, language: "en", original: "I goed", correction: "I went", category: "verb_tense" }).returning();
    await expect(db.insert(mistakeOccurrences).values({ mistakeId: mistake!.id, sessionId: id, language: "en", severity: "huge" })).rejects.toThrow();
    await expect(db.insert(speakingLevels).values({ learnerId, language: "en", level: "D1", source: "placement", assessedAt: new Date() })).rejects.toThrow();
  });

  it("lets an optional column stay empty", async () => {
    await expect(db.insert(sessions).values({ learnerId, language: "en", mode: "placement", supportStep: null, trackStage: null })).resolves.toBeDefined();
  });
});
