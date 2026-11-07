import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Mode } from "../../domain/conversation/mode.js";
import type { SessionSignalsRecord } from "../../domain/ports/signals.repository.js";
import type { Database } from "./db.module.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { DrizzleSignalsRepository } from "./drizzle-signals.repository.js";
import { createTestDatabase } from "./test-database.js";

let db: Database;
let close: () => Promise<void>;
let signals: DrizzleSignalsRepository;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  signals = new DrizzleSignalsRepository(db);
});
afterEach(() => close());

const at = new Date("2026-11-07T10:00:00Z");

async function recordFor(language: string, mode: Mode, wordsPerMinute: number): Promise<SessionSignalsRecord> {
  const session = await new DrizzleSessionRepository(db).create({ language, mode });
  return signals.recordOnce({
    sessionId: session.id,
    language,
    mode,
    // Same time on purpose: insertion order decides, not the timestamp.
    recordedAt: at,
    signals: {
      unaidedShare: 0.75,
      wordsPerMinute,
      longPausesPerMinute: 1.5,
      averagePauseMs: 1200,
      mistakesPer100Words: 4.3,
      selfCorrectionRate: 1 / 3,
    },
  });
}

describe("DrizzleSignalsRepository", () => {
  it("keeps the first signals of a session", async () => {
    const first = await recordFor("en", "daily", 70);
    const again = await signals.recordOnce({ ...first, signals: { ...first.signals, wordsPerMinute: 99 } });
    expect(again).toEqual(first);
    // Stored without loss: the comparison and the summary show the same numbers.
    expect(first.signals).toMatchObject({ wordsPerMinute: 70, mistakesPer100Words: 4.3, selfCorrectionRate: 1 / 3 });
  });

  it("lists the sessions of the same language stored before one, newest first", async () => {
    const one = await recordFor("en", "daily", 60);
    await recordFor("es", "daily", 50);
    const two = await recordFor("en", "free_talk", 70);
    const three = await recordFor("en", "review", 80);

    const earlier = await signals.earlierThan(three.sessionId, 3);
    expect(earlier.map((r) => r.sessionId)).toEqual([two.sessionId, one.sessionId]);
    expect(await signals.earlierThan(three.sessionId, 1)).toEqual([two]);
    expect(await signals.earlierThan(one.sessionId, 3)).toEqual([]);
  });
});
