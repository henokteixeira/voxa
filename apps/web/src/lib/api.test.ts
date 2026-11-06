import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "./api";

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("createApiClient", () => {
  it("starts a session with the mode and language", async () => {
    const fetchImpl = respond(201, { sessionId: "s1", mode: "daily", language: "en", message: "Morning!" });
    const api = createApiClient("http://api", fetchImpl);

    await expect(api.startSession("daily")).resolves.toMatchObject({ sessionId: "s1", message: "Morning!" });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://api/api/sessions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ mode: "daily", language: "en" });
  });

  it("sends a turn to the session", async () => {
    const fetchImpl = respond(200, { kind: "hint", message: "Check the verb.", selfCorrected: false });
    const api = createApiClient("http://api", fetchImpl);

    await api.sendTurn("s1", "I goed");

    expect(fetchImpl.mock.calls[0][0]).toBe("http://api/api/sessions/s1/turns");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ text: "I goed" });
  });

  it("lists the mistake bank in a language", async () => {
    const mistake = { id: "m1", language: "en", original: "I goed", correction: "I went", category: "grammar", occurrences: 2, lastSeenAt: "2026-11-05T10:00:00.000Z", status: "open" };
    const fetchImpl = respond(200, { mistakes: [mistake] });
    const api = createApiClient("http://api", fetchImpl);

    await expect(api.listMistakes()).resolves.toEqual([mistake]);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://api/api/mistakes?language=en");
  });

  it("dismisses a mistake with a reason and accepts an empty answer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const api = createApiClient("http://api", fetchImpl);

    await expect(api.dismissMistake("m1", "transcript_error")).resolves.toBeUndefined();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://api/api/mistakes/m1/dismiss");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ reason: "transcript_error" });
  });

  it.each([
    [400, "invalid"],
    [404, "not_found"],
    [409, "ended"],
    [502, "tutor_unavailable"],
    [500, "server"],
  ])("turns HTTP %i into a %s error with the server's message", async (status, kind) => {
    const api = createApiClient("http://api", respond(status, { message: "Nope." }));
    const error = await api.endSession("s1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind, status, message: "Nope." });
  });

  it("reports offline when the server can't be reached", async () => {
    const api = createApiClient("http://api", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api.health()).rejects.toMatchObject({ kind: "offline" });
  });
});
