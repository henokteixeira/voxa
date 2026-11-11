import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FasterRoundRecord } from "../../domain/ports/faster-round.repository.js";
import type { Database } from "./db.module.js";
import { DrizzleFasterRoundRepository } from "./drizzle-faster-round.repository.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { createTestDatabase } from "./test-database.js";

let db: Database;
let learnerId: string;
let close: () => Promise<void>;
let rounds: DrizzleFasterRoundRepository;

beforeEach(async () => {
  ({ db, learnerId, close } = await createTestDatabase());
  rounds = new DrizzleFasterRoundRepository(db);
});
afterEach(() => close());

describe("DrizzleFasterRoundRepository", () => {
  it("keeps the first copy of each round and lists them in order", async () => {
    const session = await new DrizzleSessionRepository(db, learnerId).create({ language: "en", mode: "daily" });
    const round = (n: number, transcript: string): FasterRoundRecord => ({
      sessionId: session.id,
      language: "en",
      round: n,
      timeLimitMs: 120_000,
      transcript,
      spokenWords: 3,
      speechMs: 4_000,
      longPauses: 1,
      recordedAt: new Date("2026-11-09T10:00:00Z"),
    });
    await rounds.saveOnce(round(2, "second"));
    await rounds.saveOnce(round(1, "first"));
    await rounds.saveOnce(round(1, "retry"));

    expect(await rounds.list(session.id)).toEqual([round(1, "first"), round(2, "second")]);
  });

  it("lists the rounds told since a time, in one language", async () => {
    const sessionRepo = new DrizzleSessionRepository(db, learnerId);
    const en = await sessionRepo.create({ language: "en", mode: "daily" });
    const es = await sessionRepo.create({ language: "es", mode: "daily" });
    const round = (sessionId: string, language: string, n: number, at: string): FasterRoundRecord => ({
      sessionId, language, round: n, timeLimitMs: 120_000, transcript: "t", spokenWords: 1, speechMs: 60_000, longPauses: 0, recordedAt: new Date(at),
    });
    await rounds.saveOnce(round(en.id, "en", 1, "2026-11-08T10:00:00Z"));
    await rounds.saveOnce(round(en.id, "en", 2, "2026-11-09T10:00:00Z"));
    await rounds.saveOnce(round(es.id, "es", 1, "2026-11-09T10:00:00Z"));

    expect(await rounds.toldSince("en", new Date("2026-11-09T00:00:00Z"))).toEqual([
      { sessionId: en.id, speechMs: 60_000, recordedAt: new Date("2026-11-09T10:00:00Z") },
    ]);
  });
});
