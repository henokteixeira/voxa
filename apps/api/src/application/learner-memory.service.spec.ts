import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../infra/db/db.module.js";
import { DrizzleLearnerMemoryRepository } from "../infra/db/drizzle-learner-memory.repository.js";
import { DrizzleSessionRepository } from "../infra/db/drizzle-session.repository.js";
import { createTestDatabase } from "../infra/db/test-database.js";
import type { MemoryExtractorPort } from "../domain/ports/memory-extractor.port.js";
import { LearnerMemoryService } from "./learner-memory.service.js";

const now = new Date("2026-11-07T18:00:00Z");
let db: Database;
let close: () => Promise<void>;
let sessions: DrizzleSessionRepository;
let memory: DrizzleLearnerMemoryRepository;
let extract: ReturnType<typeof vi.fn<MemoryExtractorPort["extract"]>>;
let service: LearnerMemoryService;

beforeEach(async () => {
  vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  ({ db, close } = await createTestDatabase());
  sessions = new DrizzleSessionRepository(db);
  memory = new DrizzleLearnerMemoryRepository(db);
  extract = vi.fn<MemoryExtractorPort["extract"]>().mockResolvedValue({
    recap: "Talked about work.",
    added: [{ topic: "work", statement: "Works as a developer." }],
    updated: [],
  });
  service = new LearnerMemoryService(sessions, memory, { extract }, { now: () => now });
});
afterEach(() => close());

async function endedSession(said: string | null) {
  const session = await sessions.create({ language: "en", mode: "free_talk" });
  await sessions.appendTurn(session.id, { role: "assistant", content: "What do you do?" });
  if (said) await sessions.appendTurn(session.id, { role: "user", content: said });
  await sessions.end(session.id, null);
  return session;
}

describe("LearnerMemoryService", () => {
  it("saves what an ended session taught, with the known facts sent along, once", async () => {
    const session = await endedSession("I am developer.");
    await service.remember(session.id);
    await service.remember(session.id);

    expect(extract).toHaveBeenCalledTimes(1);
    expect(extract).toHaveBeenCalledWith(expect.objectContaining({ language: "en", mode: "free_talk", known: [] }));
    expect((await memory.facts()).map((f) => f.statement)).toEqual(["Works as a developer."]);
    expect(await memory.recentSessions(3, new Date("2100-01-01"))).toEqual([expect.objectContaining({ recap: "Talked about work." })]);
  });

  it("does not call Claude when the learner said nothing, and does not try again", async () => {
    const session = await endedSession(null);
    await service.remember(session.id);
    expect(extract).not.toHaveBeenCalled();
    expect(await memory.remembered(session.id)).toBe(true);
  });

  it("waits for the session to end", async () => {
    const session = await sessions.create({ language: "en", mode: "daily" });
    await service.remember(session.id);
    expect(extract).not.toHaveBeenCalled();
    expect(await memory.remembered(session.id)).toBe(false);
  });

  it("logs a failure, leaves the session unremembered, and a sweep picks it up", async () => {
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const session = await endedSession("I am developer.");
    extract.mockRejectedValueOnce(new Error("down"));

    await expect(service.rememberLater(session.id)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("down"), expect.anything());
    expect(await memory.remembered(session.id)).toBe(false);

    await service.sweep();
    expect(await memory.facts()).toHaveLength(1);
    expect(await memory.unremembered(5)).toEqual([]);
  });

  it("runs one session at a time: two ends at once call Claude once, and a run sees the facts the one before saved", async () => {
    const first = await endedSession("I am developer.");
    const second = await endedSession("I live in Brazil.");
    await Promise.all([service.rememberLater(first.id), service.rememberLater(first.id), service.rememberLater(second.id)]);

    expect(extract).toHaveBeenCalledTimes(2);
    expect(extract.mock.calls[1][0].known.map((f) => f.statement)).toEqual(["Works as a developer."]);
  });

  it("recalls every fact and the last three sessions before this one, with how many days ago", async () => {
    for (const [day, said] of [["05", "a"], ["06", "b"], ["07", "c"], ["08", "d"]]) {
      const s = await sessions.create({ language: "en", mode: "daily", startedAt: new Date(`2026-11-${day}T10:00:00Z`) });
      await sessions.appendTurn(s.id, { role: "user", content: said });
      await sessions.end(s.id, null);
      extract.mockResolvedValueOnce({ recap: `Day ${day}.`, added: [{ topic: "work", statement: `Fact ${said}.` }], updated: [] });
      await service.remember(s.id);
    }

    const memoryNow = await service.recall({ startedAt: new Date("2026-11-08T09:00:00Z") });

    expect(memoryNow.facts.map((f) => f.statement)).toEqual(["Fact a.", "Fact b.", "Fact c.", "Fact d."]);
    // The session of the 8th started later than this one: left out.
    expect(memoryNow.recentSessions).toEqual([
      { mode: "daily", daysAgo: 1, recap: "Day 07." },
      { mode: "daily", daysAgo: 2, recap: "Day 06." },
      { mode: "daily", daysAgo: 3, recap: "Day 05." },
    ]);
  });
});
