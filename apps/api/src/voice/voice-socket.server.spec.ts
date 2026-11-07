import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { SessionEndedError, SessionNotFoundError } from "../application/conversation.service.js";
import { VoiceConversationService, type VoiceTurnEvents } from "../application/voice-conversation.service.js";
import { TutorUnavailableError } from "../domain/ports/tutor.port.js";
import { VoiceRequestError, VoiceUnavailableError } from "../domain/ports/voice.port.js";
import { SESSION_IN_USE_CLOSE_CODE, VoiceSocketServer } from "./voice-socket.server.js";

const id = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const tutor = { kind: "reply", message: "Nice. What's next?", selfCorrected: false };
const voice = { turn: vi.fn(), speakLast: vi.fn() };
let app: INestApplication;
let url: string;

/** A minimal WAV: RIFF/WAVE header plus a few samples. */
function wav(tag = "audio") {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.write("WAVE", 8, "ascii");
  return Buffer.concat([header, Buffer.from(tag)]);
}

type Frame = { json: Record<string, unknown> } | { binary: Buffer };

/** Opens a socket and collects frames until a "done" (or error) message arrives. */
async function connect(path = `/api/sessions/${id}/voice`) {
  const ws = new WebSocket(`${url}${path}`);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  const frames: Frame[] = [];
  let waiter: (() => void) | null = null;
  ws.on("message", (data: Buffer, isBinary: boolean) => {
    frames.push(isBinary ? { binary: data } : { json: JSON.parse(data.toString()) });
    waiter?.();
  });
  const until = async (type: string) => {
    while (!frames.some((f) => "json" in f && f.json.type === type)) {
      await new Promise<void>((resolve) => (waiter = resolve));
    }
    return frames.splice(0);
  };
  return { ws, until };
}

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await Test.createTestingModule({
    providers: [VoiceSocketServer, { provide: VoiceConversationService, useValue: voice }],
  }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix("api");
  await app.listen(0);
  url = (await app.getUrl()).replace("http", "ws").replace("[::1]", "localhost");
});
afterEach(() => app.close());

describe("voice socket", () => {
  it("sends the transcript, the tutor's turn, then the speech and done", async () => {
    voice.turn.mockImplementation(async (_id: string, _input: unknown, events: VoiceTurnEvents) => {
      events.transcript("I finished it.");
      events.tutor(tutor as never);
      return Buffer.from("RIFFwav");
    });
    const { ws, until } = await connect();

    ws.send(wav());
    const frames = await until("done");

    expect(voice.turn).toHaveBeenCalledWith(id, { audio: wav(), mimeType: "audio/wav" }, expect.anything());
    expect(frames).toEqual([
      { json: { type: "transcript", text: "I finished it." } },
      { json: { type: "tutor", ...tutor } },
      { binary: Buffer.from("RIFFwav") },
      { json: { type: "done" } },
    ]);
    ws.close();
  });

  it("sends the reply's speech, then the follow-up and its speech", async () => {
    voice.turn.mockImplementation(async (_id: string, _input: unknown, events: VoiceTurnEvents) => {
      events.tutor(tutor as never);
      events.speech(Buffer.from("RIFFreply"));
      events.followUp({ ...tutor, kind: "hint", message: "When did it happen?" } as never);
      return Buffer.from("RIFFhint");
    });
    const { ws, until } = await connect();

    ws.send(wav());
    const frames = await until("done");

    expect(frames).toEqual([
      { json: { type: "tutor", ...tutor } },
      { binary: Buffer.from("RIFFreply") },
      { json: { type: "followup", ...tutor, kind: "hint", message: "When did it happen?" } },
      { binary: Buffer.from("RIFFhint") },
      { json: { type: "done" } },
    ]);
    ws.close();
  });

  it("sends a follow-up with nothing to say as a null message", async () => {
    voice.turn.mockImplementation(async (_id: string, _input: unknown, events: VoiceTurnEvents) => {
      events.followUp({ ...tutor, kind: "reply", message: "" } as never);
      return null;
    });
    const { ws, until } = await connect();

    ws.send(wav());
    const frames = await until("done");

    expect(frames[0]).toEqual({ json: { type: "followup", ...tutor, kind: "reply", message: null } });
    ws.close();
  });

  it("takes a typed turn", async () => {
    voice.turn.mockResolvedValue(null);
    const { ws, until } = await connect();

    ws.send(JSON.stringify({ type: "text", text: "I finished it" }));
    const frames = await until("done");

    expect(voice.turn).toHaveBeenCalledWith(id, { text: "I finished it" }, expect.anything());
    expect(frames).toEqual([{ json: { type: "done" } }]);
    ws.close();
  });

  it("speaks the last tutor line on request", async () => {
    voice.speakLast.mockResolvedValue(Buffer.from("RIFFhello"));
    const { ws, until } = await connect();

    ws.send(JSON.stringify({ type: "speak" }));
    const frames = await until("done");

    expect(voice.speakLast).toHaveBeenCalledWith(id);
    expect(frames).toEqual([{ binary: Buffer.from("RIFFhello") }, { json: { type: "done" } }]);
    ws.close();
  });

  it.each([
    [new SessionNotFoundError(), "not_found"],
    [new SessionEndedError(), "ended"],
    [new TutorUnavailableError(), "tutor_unavailable"],
    [new VoiceUnavailableError("down"), "voice_unavailable"],
    [new VoiceRequestError("bad", 422), "bad_audio"],
    [new Error("boom"), "server"],
  ])("reports %o as a %s error, then done", async (error, code) => {
    voice.turn.mockRejectedValue(error);
    const { ws, until } = await connect();

    ws.send(wav());
    const frames = await until("done");

    expect(frames).toEqual([
      { json: { type: "error", code, message: expect.any(String) } },
      { json: { type: "done" } },
    ]);
    ws.close();
  });

  it.each([["not json"], [JSON.stringify({ type: "dance" })], [JSON.stringify({ type: "text", text: " " })]])(
    "rejects the invalid message %s",
    async (message) => {
      const { ws, until } = await connect();
      ws.send(message);
      const frames = await until("done");
      expect(frames[0]).toEqual({ json: { type: "error", code: "invalid", message: expect.any(String) } });
      expect(voice.turn).not.toHaveBeenCalled();
      ws.close();
    },
  );

  it("handles one turn at a time", async () => {
    let finish: (value: null) => void = () => {};
    voice.turn.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { ws, until } = await connect();

    ws.send(wav("first"));
    ws.send(wav("second"));
    const busy = await until("error");
    expect(busy).toEqual([{ json: { type: "error", code: "busy", message: expect.any(String) } }]);

    finish(null);
    // "busy" is out of band: only the first request gets a "done".
    expect(await until("done")).toEqual([{ json: { type: "done" } }]);
    expect(voice.turn).toHaveBeenCalledTimes(1);
    ws.close();
  });

  it("rejects audio that is not WAV without calling speech-to-text", async () => {
    const { ws, until } = await connect();
    ws.send(Buffer.from("not a wav file at all, just some bytes that are long enough"));
    const frames = await until("done");
    expect(frames[0]).toEqual({ json: { type: "error", code: "bad_audio", message: expect.any(String) } });
    expect(voice.turn).not.toHaveBeenCalled();
    ws.close();
  });

  it("closes the socket on a frame over the limit and keeps serving others", async () => {
    const { ws } = await connect();
    const closed = new Promise<number>((resolve) => ws.once("close", resolve));
    ws.send(Buffer.alloc(11 * 1024 * 1024));
    expect(await closed).toBe(1009);

    voice.speakLast.mockResolvedValue(null);
    const next = await connect();
    next.ws.send(JSON.stringify({ type: "speak" }));
    expect(await next.until("done")).toEqual([{ json: { type: "done" } }]);
    next.ws.close();
  });

  it("allows one live socket per session", async () => {
    const first = await connect();
    const second = await connect();
    const code = await new Promise<number>((resolve) => second.ws.once("close", resolve));
    expect(code).toBe(SESSION_IN_USE_CLOSE_CODE);

    const firstClosed = new Promise((resolve) => first.ws.once("close", resolve));
    first.ws.close();
    await firstClosed;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const third = await connect();
    voice.speakLast.mockResolvedValue(null);
    third.ws.send(JSON.stringify({ type: "speak" }));
    expect(await third.until("done")).toEqual([{ json: { type: "done" } }]);
    third.ws.close();
  });

  it("refuses other paths and bad session ids", async () => {
    await expect(connect("/api/sessions/not-a-uuid/voice")).rejects.toThrow();
    await expect(connect(`/sessions/${id}/voice`)).rejects.toThrow();
    await expect(connect(`/other/api/sessions/${id}/voice`)).rejects.toThrow();
  });
});
