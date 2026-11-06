import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PendingCorrection } from "../../domain/conversation/types.js";
import type { Database } from "./db.module.js";
import { DrizzleMistakeRepository } from "./drizzle-mistake.repository.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { createTestDatabase } from "./test-database.js";

let db: Database;
let close: () => Promise<void>;
let sessions: DrizzleSessionRepository;
let mistakes: DrizzleMistakeRepository;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  sessions = new DrizzleSessionRepository(db);
  mistakes = new DrizzleMistakeRepository(db);
});
afterEach(() => close());

const goed = { language: "en", original: "I goed", correction: "I went", category: "grammar" };

describe("DrizzleSessionRepository", () => {
  it("creates a session with its language and mode, and no pending correction", async () => {
    const created = await sessions.create({ language: "en", mode: "daily" });
    expect(await sessions.get(created.id)).toEqual({
      id: created.id,
      language: "en",
      mode: "daily",
      pending: null,
      endedAt: null,
    });
  });

  it("returns null for an unknown session", async () => {
    expect(await sessions.get("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("keeps turns in the order they were added", async () => {
    const { id } = await sessions.create({ language: "en", mode: "free_talk" });
    await sessions.appendTurn(id, { role: "assistant", content: "Hi" });
    await sessions.appendTurn(id, { role: "user", content: "Hello" });
    await sessions.appendTurn(id, { role: "assistant", content: "How was your week?" });
    expect(await sessions.history(id)).toEqual([
      { role: "assistant", content: "Hi" },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "How was your week?" },
    ]);
  });

  it("stores and clears the pending correction", async () => {
    const { id } = await sessions.create({ language: "en", mode: "presentation" });
    const pending: PendingCorrection = { original: "I goed", correction: "I went", category: "grammar", hintsGiven: 1, revealed: false };
    await sessions.setPending(id, pending);
    expect((await sessions.get(id))?.pending).toEqual({
      original: "I goed",
      correction: "I went",
      category: "grammar",
      hintsGiven: 1,
      revealed: false,
    });
    await sessions.setPending(id, null);
    expect((await sessions.get(id))?.pending).toBeNull();
  });

  it("marks a session as ended", async () => {
    const { id } = await sessions.create({ language: "en", mode: "review" });
    await sessions.end(id);
    expect((await sessions.get(id))?.endedAt).toBeInstanceOf(Date);
  });
});

describe("DrizzleMistakeRepository", () => {
  it("counts a repeated mistake once in the bank and once per occurrence", async () => {
    const s1 = await sessions.create({ language: "en", mode: "daily" });
    const s2 = await sessions.create({ language: "en", mode: "daily" });
    await mistakes.record(goed, { sessionId: s1.id, severity: "minor" });
    const again = await mistakes.record(goed, { sessionId: s2.id, severity: "serious" });

    expect(again.occurrences).toBe(2);
    expect(await mistakes.forSession(s2.id)).toEqual([
      {
        original: "I goed",
        correction: "I went",
        category: "grammar",
        severity: "serious",
        selfCorrected: false,
        occurrences: 2,
      },
    ]);
  });

  it("keeps the same text in different languages apart", async () => {
    const s = await sessions.create({ language: "en", mode: "daily" });
    await mistakes.record(goed, { sessionId: s.id, severity: "minor" });
    await mistakes.record({ ...goed, language: "es" }, { sessionId: s.id, severity: "minor" });
    expect((await mistakes.mostFrequent("en", 10)).map((m) => m.occurrences)).toEqual([1]);
  });

  it("lists the most frequent mistakes first, up to the limit", async () => {
    const s = await sessions.create({ language: "en", mode: "daily" });
    const rare = { ...goed, original: "more better", correction: "better" };
    await mistakes.record(rare, { sessionId: s.id, severity: "minor" });
    await mistakes.record(goed, { sessionId: s.id, severity: "minor" });
    await mistakes.record(goed, { sessionId: s.id, severity: "minor" });

    expect((await mistakes.mostFrequent("en", 1)).map((m) => m.original)).toEqual(["I goed"]);
    expect((await mistakes.mostFrequent("en", 5)).map((m) => m.original)).toEqual(["I goed", "more better"]);
  });

  it("marks a self-correction only in that session", async () => {
    const s1 = await sessions.create({ language: "en", mode: "daily" });
    const s2 = await sessions.create({ language: "en", mode: "daily" });
    await mistakes.record(goed, { sessionId: s1.id, severity: "serious" });
    await mistakes.record(goed, { sessionId: s2.id, severity: "serious" });

    await mistakes.markSelfCorrected(s2.id, "I goed");

    expect((await mistakes.forSession(s1.id))[0].selfCorrected).toBe(false);
    expect((await mistakes.forSession(s2.id))[0].selfCorrected).toBe(true);
  });
});
