import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, deviceTimeZone } from "./api";

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

  it("gets an open session to pick it up again", async () => {
    const fetchImpl = respond(200, { sessionId: "s1", mode: "daily", turns: [], hint: null });
    const api = createApiClient("http://api", fetchImpl);

    await expect(api.resumeSession("s1")).resolves.toMatchObject({ sessionId: "s1", mode: "daily" });
    expect(fetchImpl.mock.calls[0][0]).toBe("http://api/api/sessions/s1");
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
    const timing = { learnerSpeechMs: 1000, tutorSpeechMs: 2000, pausesMs: [500], longPausesMs: [1200], spokenWords: 3 };

    await api.endSession("s1", timing);

    expect(fetchImpl.mock.calls[0][0]).toBe("http://api/api/sessions/s1/end");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ timing });
  });

  it("builds the voice socket address from the API address", () => {
    expect(createApiClient("http://localhost:3000").voiceUrl("s1")).toBe("ws://localhost:3000/api/sessions/s1/voice");
    expect(createApiClient("https://voxa.local").voiceUrl("s 1")).toBe("wss://voxa.local/api/sessions/s%201/voice");
  });

  it("loads every filler line of a language as audio", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 2 }), { status: 200 }))
      .mockImplementation(async () => new Response(new Uint8Array([1, 2]), { status: 200 }));
    const api = createApiClient("http://api", fetchImpl);

    const clips = await api.fillerSpeech("en-US");

    expect(clips.map((clip) => clip.byteLength)).toEqual([2, 2]);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "http://api/api/voice/fillers?language=en-US",
      "http://api/api/voice/fillers/0?language=en-US",
      "http://api/api/voice/fillers/1?language=en-US",
    ]);
  });

  it("fails the filler lines when one can't be loaded", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const api = createApiClient("http://api", fetchImpl);

    await expect(api.fillerSpeech()).rejects.toMatchObject({ kind: "tutor_unavailable", status: 503 });
  });

  it("lists the mistake bank in a language", async () => {
    const mistake = { id: "m1", language: "en", original: "I goed", correction: "I went", category: "grammar", occurrences: 2, lastSeenAt: "2026-11-05T10:00:00.000Z", status: "open" };
    const fetchImpl = respond(200, { mistakes: [mistake] });
    const api = createApiClient("http://api", fetchImpl);

    await expect(api.listMistakes()).resolves.toEqual([mistake]);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://api/api/mistakes?language=en");
  });

  it("asks for a review card and sends the answer, null for \"I don't know\"", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response("{}", { status: 200 }));
    const api = createApiClient("http://api", fetchImpl);

    await api.reviewCard({ kind: "pattern", id: "p1" });
    await api.answerReview("c1", null);
    await api.answerReview("c2", "I finished it", 2400);
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init.method, JSON.parse(init.body)])).toEqual([
      ["http://api/api/reviews/cards", "POST", { subject: { kind: "pattern", id: "p1" } }],
      ["http://api/api/reviews/answers", "POST", { cardId: "c1", utterance: null, timeZone: deviceTimeZone(), startDelayMs: null }],
      ["http://api/api/reviews/answers", "POST", { cardId: "c2", utterance: "I finished it", timeZone: deviceTimeZone(), startDelayMs: 2400 }],
    ]);
  });

  it("sends a recording to be transcribed", async () => {
    const fetchImpl = respond(200, { text: "I finished it" });
    const api = createApiClient("http://api", fetchImpl);
    const wav = new ArrayBuffer(8);

    await expect(api.transcribe(wav)).resolves.toBe("I finished it");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://api/api/voice/transcriptions?language=en");
    expect(init).toMatchObject({ method: "POST", headers: { "content-type": "audio/wav" }, body: wav });
  });

  it("lists, rewrites and deletes what Voxa knows about the learner", async () => {
    const fact = { id: "f1", topic: "work", statement: "Works at JOCUM.", learnedAt: "x", updatedAt: "y" };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ facts: [fact] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(fact), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = createApiClient("http://api", fetchImpl);

    await expect(api.learnerFacts()).resolves.toEqual([fact]);
    await expect(api.editLearnerFact("f1", "Works at JOCUM.")).resolves.toEqual(fact);
    await expect(api.deleteLearnerFact("f1")).resolves.toBeUndefined();
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ["http://api/api/memory/facts", "GET"],
      ["http://api/api/memory/facts/f1", "PATCH"],
      ["http://api/api/memory/facts/f1", "DELETE"],
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ statement: "Works at JOCUM." });
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

  it("reads today's progress in the device's time zone and sets the minutes a day", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ earnedXp: 12 }), { status: 200 }));
    const api = createApiClient("http://api", fetchImpl);

    await expect(api.todayProgress("en", "America/Sao_Paulo")).resolves.toMatchObject({ earnedXp: 12 });
    expect(fetchImpl.mock.calls[0][0]).toBe("http://api/api/progress/today?language=en&timeZone=America%2FSao_Paulo");

    await api.setDailyMinutes(45, "en", "UTC");
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe("http://api/api/progress/daily-goal");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ language: "en", timeZone: "UTC", minutesPerDay: 45 });
  });

  it("keeps the server's error code and request id", async () => {
    const api = createApiClient("http://api", respond(404, { code: "not_found", message: "Nope.", requestId: "r1" }));
    await expect(api.endSession("s1")).rejects.toMatchObject({ kind: "not_found", code: "not_found", requestId: "r1" });
  });

  it("reports an unexpected server failure with its request id", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const api = createApiClient("http://api", respond(500, { code: "internal", message: "Oops.", requestId: "r2" }));
    await api.health().catch(() => {});
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("api GET /health"), expect.objectContaining({ requestId: "r2" }));
    spy.mockRestore();
  });

  it("reports offline when the server can't be reached", async () => {
    const api = createApiClient("http://api", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api.health()).rejects.toMatchObject({ kind: "offline" });
  });
});
