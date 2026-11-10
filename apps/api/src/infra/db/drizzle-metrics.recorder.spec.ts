import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./db.module.js";
import { DrizzleMetricsRecorder } from "./drizzle-metrics.recorder.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { modelCalls, voiceTurnTimings } from "./schema.js";
import { createTestDatabase } from "./test-database.js";

let db: Database;
let close: () => Promise<void>;
let recorder: DrizzleMetricsRecorder;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  recorder = new DrizzleMetricsRecorder(db);
});
afterEach(() => close());

const call = { task: "tutor_turn", model: "claude-opus-5-5", effort: "low", inputTokens: 10, cacheReadTokens: 3000, cacheWriteTokens: 0, outputTokens: 250, durationMs: 1800, failed: false };

describe("DrizzleMetricsRecorder", () => {
  it("keeps each voice turn's timing and each model call", async () => {
    const { id } = await new DrizzleSessionRepository(db).create({ language: "en", mode: "daily" });

    await recorder.voiceTurn({ sessionId: id, sttMs: null, tutorMs: 2000, ttsMs: 600, totalMs: 2600 });
    await recorder.modelCall(call);

    expect(await db.select().from(voiceTurnTimings)).toEqual([expect.objectContaining({ sessionId: id, sttMs: null, totalMs: 2600 })]);
    expect(await db.select().from(modelCalls)).toEqual([expect.objectContaining(call)]);
  });

  it("never rejects: a timing it cannot save is only logged", async () => {
    await expect(recorder.voiceTurn({ sessionId: "00000000-0000-4000-8000-000000000000", sttMs: 1, tutorMs: 1, ttsMs: 1, totalMs: 3 })).resolves.toBeUndefined();
  });
});
