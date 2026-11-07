import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { clearSavedSession, isExpired, loadSavedSession, RESUME_LIMIT_MS, saveSession, takeSavedSession } from "./saved-session";

const saved = {
  sessionId: "s1",
  mode: "daily" as const,
  elapsedSeconds: 65,
  timing: { learnerSpeechMs: 1000, tutorSpeechMs: 2000, pausesMs: [900] },
};

describe("saved session", () => {
  it("keeps the live session across a reload, until it is cleared", () => {
    expect(loadSavedSession()).toBeNull();
    saveSession(saved);
    expect(loadSavedSession()).toEqual({ ...saved, savedAt: expect.any(Number) });
    clearSavedSession();
    expect(loadSavedSession()).toBeNull();
  });

  it("ignores data it can't read", () => {
    localStorage.setItem("voxa.liveSession", "{not json");
    expect(loadSavedSession()).toBeNull();
    localStorage.setItem("voxa.liveSession", JSON.stringify({ sessionId: "s1", mode: "karaoke" }));
    expect(loadSavedSession()).toBeNull();
  });

  it("starts the timing from zero when the saved timing is broken", () => {
    localStorage.setItem("voxa.liveSession", JSON.stringify({ ...saved, timing: { learnerSpeechMs: 5 } }));
    expect(loadSavedSession()?.timing).toEqual({ learnerSpeechMs: 0, tutorSpeechMs: 0, pausesMs: [] });
  });

  it("can be picked up for 2 hours after it was last saved", () => {
    const now = Date.now();
    expect(RESUME_LIMIT_MS).toBe(2 * 60 * 60 * 1000);
    expect(isExpired({ ...saved, savedAt: now - RESUME_LIMIT_MS }, now)).toBe(false);
    expect(isExpired({ ...saved, savedAt: now - RESUME_LIMIT_MS - 1 }, now)).toBe(true);
  });

  it("treats an entry with no save time as too old", () => {
    localStorage.setItem("voxa.liveSession", JSON.stringify(saved));
    expect(loadSavedSession()?.savedAt).toBe(0);
  });

  it("ends an expired session, and forgets it only once the server has it", async () => {
    const old = JSON.stringify({ ...saved, savedAt: Date.now() - RESUME_LIMIT_MS - 1 });
    localStorage.setItem("voxa.liveSession", old);
    const offline = { endSession: vi.fn().mockRejectedValue(new ApiError("offline", "Can't reach the Voxa API.")) };
    expect(takeSavedSession(offline)).toBeNull();
    await vi.waitFor(() => expect(offline.endSession).toHaveBeenCalledWith("s1", saved.timing));
    await Promise.resolve();
    expect(localStorage.getItem("voxa.liveSession")).toBe(old);

    const up = { endSession: vi.fn().mockResolvedValue({}) };
    expect(takeSavedSession(up)).toBeNull();
    await vi.waitFor(() => expect(localStorage.getItem("voxa.liveSession")).toBeNull());
  });
});
