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
  private readonly sttMsPerAudioSecond: number;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get("VOICE_SERVICE_URL", { infer: true });
    this.timeoutMs = config.get("VOICE_TIMEOUT_MS", { infer: true });
    this.sttMsPerAudioSecond = config.get("VOICE_STT_MS_PER_AUDIO_SECOND", { infer: true });
  }

  async transcribe(audio: Buffer, language: string, options: TranscribeOptions = {}): Promise<Transcription> {
    const mimeType = options.mimeType ?? "audio/webm";
    const extension = EXTENSIONS[mimeType.split(";")[0]] ?? "webm";
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array(audio)], { type: mimeType }), `audio.${extension}`);
    form.append("language", language);
    // A long turn takes Whisper longer: the wait grows with the speech, so a long answer is not thrown away.
    const audioMs = wavDurationMs(audio) ?? 0;
    const timeoutMs = this.timeoutMs + Math.ceil((audioMs / 1000) * this.sttMsPerAudioSecond);
    const body = await this.request("STT", "/stt", { method: "POST", body: form }, (res) => res.json(), timeoutMs);
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
    timeoutMs = this.timeoutMs,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return await read(res);
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
      const reason = timedOut ? `timed out after ${timeoutMs} ms` : "voice service unreachable or bad response";
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

/** 8 kHz 8-bit mono, the lowest rate speech is recorded at; a lower byte rate is a bad header. */
const MIN_WAV_BYTE_RATE = 8_000;
/** The socket takes at most about 5 minutes of speech; a header that claims more is not trusted. */
const MAX_WAV_MS = 10 * 60_000;

/** The length of a PCM WAV recording, from its header (at most 10 minutes); null for anything else (e.g. webm). */
export function wavDurationMs(audio: Buffer): number | null {
  if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }
  // Walk the chunks: "fmt " holds the byte rate, "data" the samples.
  let byteRate = 0;
  for (let offset = 12; offset + 8 <= audio.length; ) {
    const id = audio.toString("ascii", offset, offset + 4);
    const size = audio.readUInt32LE(offset + 4);
    if (id === "fmt " && offset + 20 <= audio.length) byteRate = audio.readUInt32LE(offset + 16);
    if (id === "data") {
      if (byteRate < MIN_WAV_BYTE_RATE) return null;
      // A streamed WAV may leave the size unset or too big: count only the bytes present.
      const bytes = Math.min(size, audio.length - offset - 8);
      return Math.min(MAX_WAV_MS, Math.round((bytes / byteRate) * 1000));
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}
