import { afterEach, describe, expect, it, vi } from "vitest";
import { testConfig } from "../../config/testing.js";
import { VoiceRequestError, VoiceUnavailableError } from "../../domain/ports/voice.port.js";
import { LocalVoiceAdapter, wavDurationMs } from "./local-voice.adapter.js";

const config = (values: Record<string, string> = {}) => testConfig({ VOICE_SERVICE_URL: "http://voice.test", ...values });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A silent 16 kHz 16-bit mono WAV of the given length. */
function wav(seconds: number): Buffer {
  const data = 16_000 * 2 * seconds;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(32_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data, 40);
  return Buffer.concat([header, Buffer.alloc(data)]);
}

const hang = (_url: string, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));

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

    expect(result).toEqual({ text: "I goes to work.", language: "en-US", audioMs: 1200, processingMs: 300 });
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

  it("throws VoiceUnavailableError on a 200 with a body that is not JSON", async () => {
    mockFetch(async () => new Response("<html>proxy error</html>", { status: 200 }));
    await expect(new LocalVoiceAdapter(config()).transcribe(Buffer.from("a"), "en")).rejects.toBeInstanceOf(
      VoiceUnavailableError,
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

  it("waits longer for a longer recording", async () => {
    mockFetch(hang);
    const adapter = new LocalVoiceAdapter(config({ VOICE_TIMEOUT_MS: "20", VOICE_STT_MS_PER_AUDIO_SECOND: "30" }));
    await expect(adapter.transcribe(wav(2), "en", { mimeType: "audio/wav" })).rejects.toThrow(
      "STT timed out after 80 ms",
    );
  });
});

describe("wavDurationMs", () => {
  it("reads the length from the header", () => {
    expect(wavDurationMs(wav(3))).toBe(3000);
  });

  it("ignores a header with an implausible byte rate", () => {
    const bad = wav(1);
    bad.writeUInt32LE(1, 28);
    expect(wavDurationMs(bad)).toBeNull();
  });

  it("is null for audio that is not WAV", () => {
    expect(wavDurationMs(Buffer.from("not a wav file at all, just some bytes here ok"))).toBeNull();
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
