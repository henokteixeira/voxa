import { describe, expect, it, vi } from "vitest";
import type { IdleSession, SessionRepository } from "../domain/ports/session.repository.js";
import { IDLE_SESSION_LIMIT_MS, IdleSessionsService } from "./idle-sessions.service.js";
import type { SessionEndService } from "./session-end.service.js";

const now = new Date("2026-11-10T12:00:00Z");

function setup(idle: IdleSession[], end: SessionEndService["end"] = vi.fn().mockResolvedValue({})) {
  const sessions = { idle: vi.fn().mockResolvedValue(idle) };
  const ending = { end: vi.fn(end) };
  const service = new IdleSessionsService(
    sessions as unknown as SessionRepository,
    ending as unknown as SessionEndService,
    { now: () => now },
  );
  return { service, sessions, ending };
}

describe("IdleSessionsService", () => {
  it("ends the sessions idle for longer than the limit at their last activity, keeping the saved timing", async () => {
    const lastActiveAt = new Date("2026-11-10T07:30:00Z");
    const { service, sessions, ending } = setup([{ id: "s1", lastActiveAt }]);

    await expect(service.closeIdle()).resolves.toBe(1);

    expect(sessions.idle).toHaveBeenCalledWith(new Date(now.getTime() - IDLE_SESSION_LIMIT_MS), expect.any(Number));
    expect(ending.end).toHaveBeenCalledWith("s1", null, lastActiveAt);
  });

  it("goes on when one session fails to close, so it is tried again next time", async () => {
    const at = new Date("2026-11-10T07:00:00Z");
    const { service, ending } = setup(
      [
        { id: "s1", lastActiveAt: at },
        { id: "s2", lastActiveAt: at },
      ],
      async (id) => {
        if (id === "s1") throw new Error("Tutor unavailable");
        return {} as Awaited<ReturnType<SessionEndService["end"]>>;
      },
    );

    await expect(service.closeIdle()).resolves.toBe(1);
    expect(ending.end).toHaveBeenCalledTimes(2);
  });

  it("never rejects when the sessions cannot be read", async () => {
    const { service, sessions } = setup([]);
    sessions.idle.mockRejectedValueOnce(new Error("Database down"));
    await expect(service.closeIdle()).resolves.toBe(0);
  });

  it("runs one check at a time", async () => {
    const { service, sessions } = setup([]);
    await Promise.all([service.closeIdle(), service.closeIdle()]);
    expect(sessions.idle).toHaveBeenCalledTimes(1);
    await service.closeIdle();
    expect(sessions.idle).toHaveBeenCalledTimes(2);
  });
});
