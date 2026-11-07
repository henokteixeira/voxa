import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PendingCorrection } from "../../domain/conversation/types.js";
import type { Database } from "./db.module.js";
import { DrizzleMistakeRepository } from "./drizzle-mistake.repository.js";
import { DrizzleSessionRepository } from "./drizzle-session.repository.js";
import { mistakeCorrectUses, mistakeOccurrences, turns } from "./schema.js";
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
      startedAt: expect.any(Date),
      endedAt: null,
      coveredGoals: [],
      lastCheckInAt: null,
      targets: [],
      metTargets: [],
      step: null,
      scaffold: null,
      track: null,
    });
  });

  it("keeps the start time, the practice targets and the goals' progress", async () => {
    const startedAt = new Date("2026-11-07T10:00:00Z");
    const targets = [{ original: "I goed", correction: "I went", category: "grammar" }];
    const { id } = await sessions.create({ language: "en", mode: "daily", startedAt, targets, step: "supported" });
    const askedAt = new Date("2026-11-07T10:09:00Z");
    await sessions.setProgress(id, { coveredGoals: ["yesterday", "today"], lastCheckInAt: askedAt, metTargets: ["I goed"],
      scaffold: "Yesterday I...",
      step: "build_light",
      track: { stage: "swap", goal: "yesterday", tries: 1, helped: true, unaidedStreak: 2, stuckStreak: 0 },
    });
    expect(await sessions.get(id)).toMatchObject({
      metTargets: ["I goed"],
      startedAt,
      targets,
      coveredGoals: ["yesterday", "today"],
      lastCheckInAt: askedAt,
      step: "build_light",
      scaffold: "Yesterday I...",
      track: { stage: "swap", goal: "yesterday", tries: 1, helped: true, unaidedStreak: 2, stuckStreak: 0 },
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

  it("keeps insertion order when turns share a timestamp", async () => {
    const { id } = await sessions.create({ language: "en", mode: "daily" });
    const at = new Date("2026-11-06T12:00:00Z");
    const contents = Array.from({ length: 12 }, (_, i) => `turn ${i}`);
    for (const content of contents) {
      await db.insert(turns).values({ sessionId: id, role: "user", content, createdAt: at });
    }
    expect((await sessions.history(id)).map((t) => t.content)).toEqual(contents);
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
    await sessions.end(id, null);
    expect((await sessions.get(id))?.endedAt).toBeInstanceOf(Date);
    expect(await sessions.outcome(id)).toEqual({ timing: null, confidence: { before: null, after: null } });
  });

  it("stores the timing of an ended session", async () => {
    const { id } = await sessions.create({ language: "en", mode: "daily" });
    const timing = { learnerSpeechMs: 61_000, tutorSpeechMs: 42_500, pausesMs: [1200, 800] };
    await sessions.end(id, timing);
    expect((await sessions.outcome(id))?.timing).toEqual(timing);
  });

  it("stores confidence before and after, the latest rating winning", async () => {
    const { id } = await sessions.create({ language: "en", mode: "presentation" });
    await sessions.setConfidence(id, "before", 2);
    await sessions.setConfidence(id, "after", 3);
    await sessions.setConfidence(id, "after", 4);
    expect((await sessions.outcome(id))?.confidence).toEqual({ before: 2, after: 4 });
  });

  it("has no outcome for an unknown session", async () => {
    expect(await sessions.outcome("6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b")).toBeNull();
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

    await mistakes.markSelfCorrected(s2.id, { language: "en", original: "I goed" });

    expect((await mistakes.forSession(s1.id))[0].selfCorrected).toBe(false);
    expect((await mistakes.forSession(s2.id))[0].selfCorrected).toBe(true);
  });

  it("marks only the latest occurrence in the session as self-corrected", async () => {
    const s = await sessions.create({ language: "en", mode: "daily" });
    await mistakes.record(goed, { sessionId: s.id, severity: "minor" });
    await mistakes.record(goed, { sessionId: s.id, severity: "serious" });

    await mistakes.markSelfCorrected(s.id, { language: "en", original: "I goed" });

    expect((await mistakes.forSession(s.id)).map((m) => m.selfCorrected)).toEqual([false, true]);
  });

  it("does not mark the same text in another language", async () => {
    const s = await sessions.create({ language: "en", mode: "daily" });
    await mistakes.record({ ...goed, language: "es" }, { sessionId: s.id, severity: "serious" });

    await mistakes.markSelfCorrected(s.id, { language: "en", original: "I goed" });

    expect((await mistakes.forSession(s.id))[0].selfCorrected).toBe(false);
  });
});

describe("DrizzleMistakeRepository as the mistake bank", () => {
  const unknownId = "00000000-0000-0000-0000-000000000000";

  it("lists mistakes of one language, most recently seen first, with who fixed each occurrence", async () => {
    const s1 = await sessions.create({ language: "en", mode: "daily" });
    const s2 = await sessions.create({ language: "en", mode: "daily" });
    const rare = { ...goed, original: "more better", correction: "better" };
    await mistakes.record(goed, { sessionId: s1.id, severity: "serious" });
    await mistakes.markSelfCorrected(s1.id, goed);
    await mistakes.record({ ...goed, language: "es" }, { sessionId: s1.id, severity: "minor" });
    await mistakes.record(rare, { sessionId: s1.id, severity: "minor" });
    await mistakes.record(goed, { sessionId: s2.id, severity: "serious" });

    const list = await mistakes.list("en");
    expect(list.map((m) => [m.original, m.occurrences])).toEqual([
      ["I goed", 2],
      ["more better", 1],
    ]);
    expect(list[0]).toMatchObject({ language: "en", correction: "I went", category: "grammar" });
    expect(list[0].lastSeenAt).toBeInstanceOf(Date);
  });

  it("counts the later sessions where the learner got a mistake right, once per session", async () => {
    const s1 = await sessions.create({ language: "en", mode: "daily" });
    await mistakes.record(goed, { sessionId: s1.id, severity: "serious" });
    const s2 = await sessions.create({ language: "en", mode: "daily" });
    const s3 = await sessions.create({ language: "en", mode: "daily" });

    await mistakes.recordCorrectUse(s1.id, goed); // same session as the mistake: not counted
    await mistakes.recordCorrectUse(s2.id, goed);
    await mistakes.recordCorrectUse(s2.id, goed);
    await mistakes.recordCorrectUse(s3.id, goed);
    await mistakes.recordCorrectUse(s3.id, { ...goed, original: "not in the bank" });

    expect((await mistakes.list("en"))[0].sessionsCorrect).toBe(2);
  });

  it("gives no correct use to a dismissed mistake", async () => {
    const s1 = await sessions.create({ language: "en", mode: "daily" });
    const saved = await mistakes.record(goed, { sessionId: s1.id, severity: "serious" });
    await mistakes.dismiss(saved.id, "both_correct");
    const s2 = await sessions.create({ language: "en", mode: "daily" });

    await mistakes.recordCorrectUse(s2.id, goed);

    expect(await db.select().from(mistakeCorrectUses)).toEqual([]);
  });

  it("starts the count again when the mistake comes back", async () => {
    const s1 = await sessions.create({ language: "en", mode: "daily" });
    await mistakes.record(goed, { sessionId: s1.id, severity: "serious" });
    const s2 = await sessions.create({ language: "en", mode: "daily" });
    await mistakes.recordCorrectUse(s2.id, goed);
    const s3 = await sessions.create({ language: "en", mode: "daily" });
    await mistakes.record(goed, { sessionId: s3.id, severity: "minor" });

    expect((await mistakes.list("en"))[0].sessionsCorrect).toBe(0);
  });

  it("takes a dismissed mistake out of the bank for good", async () => {
    const s = await sessions.create({ language: "en", mode: "daily" });
    const saved = await mistakes.record(goed, { sessionId: s.id, severity: "serious" });

    expect(await mistakes.dismiss(saved.id, "transcript_error")).toBe(true);
    const again = await mistakes.record(goed, { sessionId: s.id, severity: "serious" });

    expect(again.occurrences).toBe(1);
    expect(again.lastSeenAt).toEqual(saved.lastSeenAt);
    expect(await db.select().from(mistakeOccurrences)).toHaveLength(1);

    expect(await mistakes.list("en")).toEqual([]);
    expect(await mistakes.mostFrequent("en", 10)).toEqual([]);
    expect(await mistakes.forSession(s.id)).toEqual([]);
  });

  it("says when there is no mistake to dismiss", async () => {
    expect(await mistakes.dismiss(unknownId, "not_needed")).toBe(false);
  });
});
