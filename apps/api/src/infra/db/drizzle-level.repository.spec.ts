import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db.module.js";
import { DrizzleLevelRepository } from "./drizzle-level.repository.js";
import { createTestDatabase } from "./test-database.js";

let db: Database;
let close: () => Promise<void>;
let levels: DrizzleLevelRepository;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  levels = new DrizzleLevelRepository(db);
});
afterEach(() => close());

const placed = {
  language: "en",
  level: "A2" as const,
  source: "placement" as const,
  evidence: ["Yesterday I work in the app."],
  assessedAt: new Date("2026-11-07T10:00:00Z"),
};

describe("DrizzleLevelRepository", () => {
  it("has no level before the first one", async () => {
    expect(await levels.current("en")).toBeNull();
    expect(await levels.lastPlacementAt("en")).toBeNull();
  });

  it("keeps the newest level as the current one, per language", async () => {
    await levels.add(placed);
    // Same time on purpose: insertion order decides, not the timestamp.
    await levels.add({ ...placed, level: "B1", source: "manual", evidence: [] });
    await levels.add({ ...placed, language: "es", level: "A1" });

    expect(await levels.current("en")).toEqual({ ...placed, level: "B1", source: "manual", evidence: [] });
    expect((await levels.current("es"))?.level).toBe("A1");
  });

  it("finds the newest placement even after a level set by hand", async () => {
    await levels.add(placed);
    await levels.add({ ...placed, level: "B1", source: "manual", assessedAt: new Date("2026-11-20T10:00:00Z") });
    expect(await levels.lastPlacementAt("en")).toEqual(placed.assessedAt);
  });
});
