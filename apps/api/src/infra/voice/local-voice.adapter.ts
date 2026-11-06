import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type SpeechToTextPort,
  type TextToSpeechPort,
  type TranscribeOptions,
  type Transcription,
  VoiceRequestError,
  VoiceUnavailableError,
} from "../../domain/ports/voice.port.js";

const DEFAULT_TIMEOUT_MS = 30_000;
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

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("VOICE_SERVICE_URL") ?? "http://localhost:8001";
    this.timeoutMs = Number(config.get<string>("VOICE_TIMEOUT_MS")) || DEFAULT_TIMEOUT_MS;
  }

  async transcribe(audio: Buffer, language: string, options: TranscribeOptions = {}): Promise<Transcription> {
    const mimeType = options.mimeType ?? "audio/webm";
    const extension = EXTENSIONS[mimeType.split(";")[0]] ?? "webm";
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array(audio)], { type: mimeType }), `audio.${extension}`);
    form.append("language", language);
    const res = await this.request("STT", "/stt", { method: "POST", body: form });
    return (await res.json()) as Transcription;
  }

  async synthesize(text: string, language: string): Promise<Buffer> {
    const res = await this.request("TTS", "/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });
    return Buffer.from(await res.arrayBuffer());
  }

  private async request(what: string, path: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
      const reason = timedOut ? `timed out after ${this.timeoutMs} ms` : "voice service unreachable";
      throw new VoiceUnavailableError(`${what} ${reason}`, { cause });
    }
    if (res.ok) return res;
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
