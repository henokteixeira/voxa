import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.js";
import {
  type SpeechToTextPort,
  type TextToSpeechPort,
  type TranscribeOptions,
  type Transcription,
  VoiceRequestError,
  VoiceUnavailableError,
} from "../../domain/ports/voice.port.js";

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
};

/** Talks to the local Python service (services/voice): Whisper + Kokoro. */
@Injectable()
export class LocalVoiceAdapter implements SpeechToTextPort, TextToSpeechPort {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get("VOICE_SERVICE_URL", { infer: true });
    this.timeoutMs = config.get("VOICE_TIMEOUT_MS", { infer: true });
  }

  async transcribe(audio: Buffer, language: string, options: TranscribeOptions = {}): Promise<Transcription> {
    const mimeType = options.mimeType ?? "audio/webm";
    const extension = EXTENSIONS[mimeType.split(";")[0]] ?? "webm";
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array(audio)], { type: mimeType }), `audio.${extension}`);
    form.append("language", language);
    const body = await this.request("STT", "/stt", { method: "POST", body: form }, (res) => res.json());
    // Keep the caller's BCP 47 tag (e.g. en-US) whatever the service reports.
    return { ...(body as Transcription), language };
  }

  async synthesize(text: string, language: string): Promise<Buffer> {
    const audio = await this.request(
      "TTS",
      "/tts",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, language }) },
      (res) => res.arrayBuffer(),
    );
    return Buffer.from(audio);
  }

  /** Sends the request and reads the body; every network, timeout or parse failure becomes a voice error. */
  private async request<T>(
    what: string,
    path: string,
    init: RequestInit,
    read: (res: Response) => Promise<T>,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
      if (res.ok) return await read(res);
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
      const reason = timedOut ? `timed out after ${this.timeoutMs} ms` : "voice service unreachable or bad response";
      throw new VoiceUnavailableError(`${what} ${reason}`, { cause });
    }
    const detail = await errorDetail(res);
    if (res.status >= 500) throw new VoiceUnavailableError(`${what} failed (${res.status}): ${detail}`);
    throw new VoiceRequestError(`${what} rejected (${res.status}): ${detail}`, res.status);
  }
}

async function errorDetail(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const detail = (JSON.parse(body) as { detail?: unknown }).detail;
    return typeof detail === "string" ? detail : body;
  } catch {
    return body;
  }
}
