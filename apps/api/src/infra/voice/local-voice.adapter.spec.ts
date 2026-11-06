import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceRequestError, VoiceUnavailableError } from "../../domain/ports/voice.port.js";
import { LocalVoiceAdapter } from "./local-voice.adapter.js";

const config = (values: Record<string, string> = {}) =>
  new ConfigService({ VOICE_SERVICE_URL: "http://voice.test", ...values });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("LocalVoiceAdapter.transcribe", () => {
  it("posts the audio and language and returns the transcription with timings", async () => {
    const fetch = mockFetch(async () =>
      json({ text: "I goes to work.", language: "en", audioMs: 1200, processingMs: 300 }),
    );
    const result = await new LocalVoiceAdapter(config()).transcribe(Buffer.from("abc"), "en-US");

    expect(result).toEqual({ text: "I goes to work.", language: "en", audioMs: 1200, processingMs: 300 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://voice.test/stt");
    const form = init.body as FormData;
    expect(form.get("language")).toBe("en-US");
    expect((form.get("audio") as File).name).toBe("audio.webm");
  });

  it("names the file after the given MIME type", async () => {
    const fetch = mockFetch(async () => json({ text: "", language: "en" }));
    await new LocalVoiceAdapter(config()).transcribe(Buffer.from("abc"), "en", { mimeType: "audio/wav" });
    const form = fetch.mock.calls[0][1].body as FormData;
    expect((form.get("audio") as File).name).toBe("audio.wav");
    expect((form.get("audio") as File).type).toBe("audio/wav");
  });

  it("throws VoiceUnavailableError when the service is down", async () => {
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(new LocalVoiceAdapter(config()).transcribe(Buffer.from("a"), "en")).rejects.toBeInstanceOf(
      VoiceUnavailableError,
    );
  });

  it("throws VoiceUnavailableError on a 5xx", async () => {
    mockFetch(async () => json({ detail: "Whisper failed" }, 503));
    await expect(new LocalVoiceAdapter(config()).transcribe(Buffer.from("a"), "en")).rejects.toThrow(
      /Whisper failed/,
    );
  });

  it("throws VoiceRequestError with the status on a 4xx", async () => {
    mockFetch(async () => json({ detail: "Empty audio" }, 400));
    const error = await new LocalVoiceAdapter(config())
      .transcribe(Buffer.from(""), "en")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VoiceRequestError);
    expect((error as VoiceRequestError).status).toBe(400);
  });

  it("times out after VOICE_TIMEOUT_MS", async () => {
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    );
    const adapter = new LocalVoiceAdapter(config({ VOICE_TIMEOUT_MS: "20" }));
    await expect(adapter.transcribe(Buffer.from("a"), "en")).rejects.toThrow(/timed out/);
  });
});

describe("LocalVoiceAdapter.synthesize", () => {
  it("posts the text and returns the WAV bytes", async () => {
    const fetch = mockFetch(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const audio = await new LocalVoiceAdapter(config()).synthesize("Hello", "en");

    expect([...audio]).toEqual([1, 2, 3]);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://voice.test/tts");
    expect(JSON.parse(init.body as string)).toEqual({ text: "Hello", language: "en" });
  });

  it("throws VoiceUnavailableError when the service is down", async () => {
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(new LocalVoiceAdapter(config()).synthesize("Hi", "en")).rejects.toBeInstanceOf(
      VoiceUnavailableError,
    );
  });

  it("throws VoiceRequestError for an unsupported language", async () => {
    mockFetch(async () => json({ detail: "Unsupported language: fr" }, 422));
    await expect(new LocalVoiceAdapter(config()).synthesize("Salut", "fr")).rejects.toBeInstanceOf(
      VoiceRequestError,
    );
  });
});
