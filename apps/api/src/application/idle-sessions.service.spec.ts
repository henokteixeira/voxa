import { describe, expect, it, vi } from "vitest";
import type { SessionRepository, UnfinishedSession } from "../domain/ports/session.repository.js";
import { IDLE_SESSION_LIMIT_MS, IdleSessionsService, UNFINISHED_RETRY_MS } from "./idle-sessions.service.js";
import type { SessionEndService } from "./session-end.service.js";

const now = new Date("2026-11-10T12:00:00Z");
const at = (iso: string) => new Date(`2026-11-10T${iso}Z`);

function setup(pages: UnfinishedSession[][], close: SessionEndService["close"] = vi.fn().mockResolvedValue(undefined)) {
  const sessions = { unfinished: vi.fn() };
  for (const page of pages) sessions.unfinished.mockResolvedValueOnce(page);
  sessions.unfinished.mockResolvedValue([]);
  const ending = { close: vi.fn(close) };
  const service = new IdleSessionsService(
    sessions as unknown as SessionRepository,
    ending as unknown as SessionEndService,
    { now: () => now },
  );
  return { service, sessions, ending };
}

describe("IdleSessionsService", () => {
  it("closes the unfinished sessions at the time each one ends", async () => {
    const { service, sessions, ending } = setup([[{ id: "s1", endsAt: at("07:30:00") }]]);

    await expect(service.closeIdle()).resolves.toBe(1);

    expect(sessions.unfinished).toHaveBeenCalledWith({
      idleBefore: new Date(now.getTime() - IDLE_SESSION_LIMIT_MS),
      endedAfter: new Date(now.getTime() - UNFINISHED_RETRY_MS),
      limit: 20,
      after: undefined,
    });
    expect(ending.close).toHaveBeenCalledWith("s1", at("07:30:00"));
  });

  it("reads page after page, so sessions that keep failing do not hold back the others", async () => {
    const failing = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, endsAt: at("06:00:00") }));
    const { service, sessions, ending } = setup([failing, [{ id: "s1", endsAt: at("07:00:00") }]], async (id) => {
      if (id.startsWith("f")) throw new Error("Tutor unavailable");
    });

    await expect(service.closeIdle()).resolves.toBe(1);

    expect(sessions.unfinished).toHaveBeenCalledTimes(2);
    expect(sessions.unfinished).toHaveBeenLastCalledWith(expect.objectContaining({ after: failing[19] }));
    expect(ending.close).toHaveBeenCalledWith("s1", at("07:00:00"));
  });

  it("never rejects when the sessions cannot be read", async () => {
    const { service, sessions } = setup([]);
    sessions.unfinished.mockReset().mockRejectedValue(new Error("Database down"));
    await expect(service.closeIdle()).resolves.toBe(0);
  });

  it("runs one check at a time", async () => {
    const { service, sessions } = setup([]);
    await Promise.all([service.closeIdle(), service.closeIdle()]);
    expect(sessions.unfinished).toHaveBeenCalledTimes(1);
    await service.closeIdle();
    expect(sessions.unfinished).toHaveBeenCalledTimes(2);
  });
});
