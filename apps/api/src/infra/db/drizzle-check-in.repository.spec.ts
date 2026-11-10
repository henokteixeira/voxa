import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db.module.js";
import { CHECK_IN_TOPICS } from "../../domain/check-in/check-in.js";
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
const checkIn = (language: string, spokenWords: number, task = "present_project") => ({
  language,
  task,
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
    expect((await checkIns.list("en", { limit: 1 })).map((c) => c.id)).toEqual([second.id]);
    expect((await checkIns.previous(second.id))?.id).toBe(first.id);
    expect(await checkIns.previous(first.id)).toBeNull();
    expect(await checkIns.recording(first.id)).toEqual({ mimeType: "audio/wav", audio });
    expect(await checkIns.recording("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("keeps the fixed task and the topic tasks apart when listing and comparing", async () => {
    const recording = { mimeType: "audio/wav", audio: Buffer.from([1]) };
    const fixed1 = await checkIns.create(checkIn("en", 130), recording);
    const topic1 = await checkIns.create(checkIn("en", 60, "last_weekend"), recording);
    const fixed2 = await checkIns.create(checkIn("en", 140), recording);
    const topic2 = await checkIns.create(checkIn("en", 70, "problem_solved"), recording);

    expect((await checkIns.list("en", { kind: "benchmark" })).map((c) => c.id)).toEqual([fixed2.id, fixed1.id]);
    expect((await checkIns.list("en", { kind: "topic", limit: 1 })).map((c) => c.id)).toEqual([topic2.id]);
    expect((await checkIns.previous(fixed2.id))?.id).toBe(fixed1.id);
    expect((await checkIns.previous(topic2.id))?.id).toBe(topic1.id);
    expect(await checkIns.previous(topic1.id)).toBeNull();
  });

  it("accepts every topic of the second task, and nothing else", async () => {
    const recording = { mimeType: "audio/wav", audio: Buffer.from([1]) };
    for (const topic of CHECK_IN_TOPICS) await checkIns.create(checkIn("en", 60, topic), recording);
    await expect(checkIns.create(checkIn("en", 60, "unknown_topic"), recording)).rejects.toThrow();
  });
});
