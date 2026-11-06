import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { SessionEndedError, SessionNotFoundError } from "../application/conversation.service.js";
import { VoiceConversationService, type VoiceTurnEvents } from "../application/voice-conversation.service.js";
import { TutorUnavailableError } from "../domain/ports/tutor.port.js";
import { VoiceRequestError, VoiceUnavailableError } from "../domain/ports/voice.port.js";
import { VoiceSocketServer } from "./voice-socket.server.js";

const id = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const tutor = { kind: "reply", message: "Nice. What's next?", selfCorrected: false };
const voice = { turn: vi.fn(), speakLast: vi.fn() };
let app: INestApplication;
let url: string;

type Frame = { json: Record<string, unknown> } | { binary: Buffer };

/** Opens a socket and collects frames until a "done" (or error) message arrives. */
async function connect(path = `/sessions/${id}/voice`) {
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

    ws.send(Buffer.from("audio-bytes"));
    const frames = await until("done");

    expect(voice.turn).toHaveBeenCalledWith(
      id,
      { audio: Buffer.from("audio-bytes"), mimeType: "audio/wav" },
      expect.anything(),
    );
    expect(frames).toEqual([
      { json: { type: "transcript", text: "I finished it." } },
      { json: { type: "tutor", ...tutor } },
      { binary: Buffer.from("RIFFwav") },
      { json: { type: "done" } },
    ]);
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

    ws.send(Buffer.from("audio"));
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

    ws.send(Buffer.from("first"));
    ws.send(Buffer.from("second"));
    const busy = await until("error");
    expect(busy).toEqual([{ json: { type: "error", code: "busy", message: expect.any(String) } }]);

    finish(null);
    await until("done");
    expect(voice.turn).toHaveBeenCalledTimes(1);
    ws.close();
  });

  it("refuses other paths and bad session ids", async () => {
    await expect(connect("/sessions/not-a-uuid/voice")).rejects.toThrow();
    await expect(connect("/elsewhere")).rejects.toThrow();
  });
});
