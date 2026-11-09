import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NewMissionModel } from "../../domain/mission/mission.js";
import type { Database } from "./db.module.js";
import { DrizzleMissionRepository } from "./drizzle-mission.repository.js";
import { createTestDatabase } from "./test-database.js";

let db: Database;
let close: () => Promise<void>;
let missions: DrizzleMissionRepository;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  missions = new DrizzleMissionRepository(db);
});
afterEach(() => close());

const createdAt = new Date("2026-11-09T10:00:00Z");
const model = (speaker: string): NewMissionModel => ({
  speaker,
  text: "Yesterday I fixed the login bug. I'm blocked by the API keys.",
  expressions: [
    { position: 1, phrase: "Yesterday I…", example: "Yesterday I fixed the login bug." },
    { position: 2, phrase: "I'm blocked by…", example: "I'm blocked by the API keys." },
    { position: 3, phrase: "By the end of the day, I'll…", example: "By the end of the day, I'll ship it." },
  ],
});

describe("DrizzleMissionRepository", () => {
  it("keeps one mission per language and day", async () => {
    const first = await missions.create({ language: "en", day: "2026-11-09", situation: "daily", createdAt });
    const again = await missions.create({ language: "en", day: "2026-11-09", situation: "story", createdAt });
    const spanish = await missions.create({ language: "es", day: "2026-11-09", situation: "story", createdAt });

    expect(again).toEqual(first);
    expect(first).toMatchObject({ language: "en", day: "2026-11-09", situation: "daily", model: null });
    expect(spanish.id).not.toBe(first.id);
    expect(await missions.forDay("en", "2026-11-10")).toBeNull();
  });

  it("finds the newest mission before a day, for the rotation", async () => {
    await missions.create({ language: "en", day: "2026-11-07", situation: "daily", createdAt });
    const latest = await missions.create({ language: "en", day: "2026-11-08", situation: "my_day", createdAt });
    await missions.create({ language: "en", day: "2026-11-09", situation: "presentation", createdAt });

    expect((await missions.latestBefore("en", "2026-11-09"))?.id).toBe(latest.id);
    expect(await missions.latestBefore("en", "2026-11-07")).toBeNull();
  });

  it("stores the model once, with its expressions in order", async () => {
    const { id } = await missions.create({ language: "en", day: "2026-11-09", situation: "daily", createdAt });

    const saved = await missions.saveModel(id, model("Alex"));
    expect(saved).toMatchObject(model("Alex"));
    expect(new Set(saved.expressions.map((e) => e.id)).size).toBe(3);
    // A second model (two requests at once) does not replace the first.
    expect(await missions.saveModel(id, model("Sam"))).toEqual(saved);
    expect((await missions.get(id))?.model).toEqual(saved);
  });
});
