import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db.module.js";
import { DrizzleLevelRepository } from "./drizzle-level.repository.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { createTestDatabase } from "./test-database.js";

let db: Database;
let learnerId: string;
let close: () => Promise<void>;
let levels: DrizzleLevelRepository;

beforeEach(async () => {
  ({ db, learnerId, close } = await createTestDatabase());
  levels = new DrizzleLevelRepository(db, learnerId);
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

  it("keeps one level per placement session", async () => {
    const session = await new DrizzleSessionRepository(db, learnerId).create({ language: "en", mode: "placement" });
    expect(await levels.forSession(session.id)).toBeNull();
    expect(await levels.addForSession(session.id, placed)).toEqual(placed);
    // A second end (a retry, or two at once) keeps the first.
    expect(await levels.addForSession(session.id, { ...placed, level: "C1" })).toEqual(placed);
    expect(await levels.forSession(session.id)).toEqual(placed);
    expect(await levels.current("en")).toEqual(placed);
  });

  it("finds the newest placement even after a level set by hand", async () => {
    await levels.add(placed);
    await levels.add({ ...placed, level: "B1", source: "manual", assessedAt: new Date("2026-11-20T10:00:00Z") });
    expect(await levels.lastPlacementAt("en")).toEqual(placed.assessedAt);
  });
});
