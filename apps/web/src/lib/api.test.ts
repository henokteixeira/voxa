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

  it("ends a session with the measured timing", async () => {
    const fetchImpl = respond(200, { sessionId: "s1" });
    const api = createApiClient("http://api", fetchImpl);
    const timing = { learnerSpeechMs: 1000, tutorSpeechMs: 2000, pausesMs: [500] };

    await api.endSession("s1", timing);

    expect(fetchImpl.mock.calls[0][0]).toBe("http://api/api/sessions/s1/end");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ timing });
  });

  it("stores a confidence rating and accepts an empty answer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const api = createApiClient("http://api", fetchImpl);

    await expect(api.rateConfidence("s1", "after", 4)).resolves.toBeUndefined();

    expect(fetchImpl.mock.calls[0][0]).toBe("http://api/api/sessions/s1/confidence");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ moment: "after", value: 4 });
  });

  it("builds the voice socket address from the API address", () => {
    expect(createApiClient("http://localhost:3000").voiceUrl("s1")).toBe("ws://localhost:3000/api/sessions/s1/voice");
    expect(createApiClient("https://voxa.local").voiceUrl("s 1")).toBe("wss://voxa.local/api/sessions/s%201/voice");
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
