import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db.module.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { sessions, turns } from "./schema.js";
import { createTestDatabase } from "./test-database.js";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(() => close());

describe("schema checks", () => {
  it("keeps out a value the code does not know", async () => {
    await expect(db.insert(sessions).values({ language: "en", mode: "karaoke" })).rejects.toThrow();
    const { id } = await new DrizzleSessionRepository(db).create({ language: "en", mode: "daily" });
    await expect(db.insert(turns).values({ sessionId: id, role: "narrator", content: "Hi." })).rejects.toThrow();
  });

  it("lets an optional column stay empty", async () => {
    await expect(db.insert(sessions).values({ language: "en", mode: "placement", supportStep: null, trackStage: null })).resolves.toBeDefined();
  });
});
