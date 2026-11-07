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
    expect(await memory.recentSessions(3)).toEqual([expect.objectContaining({ recap: "Talked about work." })]);
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

  it("leaves the session unremembered when Claude fails, so a later end retries", async () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const session = await endedSession("I am developer.");
    extract.mockRejectedValueOnce(new Error("down"));
    await expect(service.remember(session.id)).rejects.toThrow("down");
    expect(await memory.remembered(session.id)).toBe(false);

    await service.remember(session.id);
    expect(await memory.facts()).toHaveLength(1);
  });
});
