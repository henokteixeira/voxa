import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SpeechToTextPort, TextToSpeechPort, Transcription } from "../../domain/ports/voice.port.js";

/** Fala com o serviço Python local (services/voice): Whisper + Kokoro. */
@Injectable()
export class LocalVoiceAdapter implements SpeechToTextPort, TextToSpeechPort {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("VOICE_SERVICE_URL") ?? "http://localhost:8001";
  }

  async transcribe(audio: Buffer, language: string): Promise<Transcription> {
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array(audio)]), "audio.webm");
    form.append("language", language);
    const res = await fetch(`${this.baseUrl}/stt`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`STT falhou: ${res.status}`);
    return (await res.json()) as Transcription;
  }

  async synthesize(text: string, language: string): Promise<Buffer> {
    const res = await fetch(`${this.baseUrl}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });
    if (!res.ok) throw new Error(`TTS falhou: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
