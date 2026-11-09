import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db.module.js";
import { DrizzleCheckInRepository } from "./drizzle-check-in.repository.js";
import { createTestDatabase } from "./test-database.js";

let db: Database;
let close: () => Promise<void>;
let checkIns: DrizzleCheckInRepository;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  checkIns = new DrizzleCheckInRepository(db);
});
afterEach(() => close());

const at = new Date("2026-11-09T10:00:00Z");
const checkIn = (language: string, spokenWords: number) => ({
  language,
  task: "present_project",
  // Same time on purpose: insertion order decides, not the timestamp.
  recordedAt: at,
  transcript: "My project helps volunteers.",
  spokenWords,
  speechMs: 120_000,
  longPauses: 4,
  mistakes: 3,
  otherLanguageWords: null,
});

describe("DrizzleCheckInRepository", () => {
  it("stores a check-in with its recording and lists them newest first", async () => {
    const audio = Buffer.from([82, 73, 70, 70, 0, 255]);
    const first = await checkIns.create(checkIn("en", 130), { mimeType: "audio/wav", audio });
    await checkIns.create(checkIn("es", 90), { mimeType: "audio/wav", audio });
    const second = await checkIns.create(checkIn("en", 160), { mimeType: "audio/wav", audio });

    expect(await checkIns.get(first.id)).toEqual({ id: first.id, ...checkIn("en", 130) });
    expect((await checkIns.list("en")).map((c) => c.id)).toEqual([second.id, first.id]);
    expect((await checkIns.list("en", 1)).map((c) => c.id)).toEqual([second.id]);
    expect((await checkIns.previous(second.id))?.id).toBe(first.id);
    expect(await checkIns.previous(first.id)).toBeNull();
    expect(await checkIns.recording(first.id)).toEqual({ mimeType: "audio/wav", audio });
    expect(await checkIns.recording("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
