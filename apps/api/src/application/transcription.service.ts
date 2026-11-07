import { Inject, Injectable } from "@nestjs/common";
import { InvalidInputError } from "../domain/errors.js";
import { STT_PORT, type SpeechToTextPort } from "../domain/ports/voice.port.js";

/** Turns a short recording into text, outside a live session (e.g. a spoken review answer). */
@Injectable()
export class TranscriptionService {
  constructor(@Inject(STT_PORT) private readonly stt: SpeechToTextPort) {}

  /** The words heard, trimmed; empty when nothing was said. */
  async transcribe(audio: Buffer, language: string, mimeType: string): Promise<{ text: string }> {
    if (audio.length === 0) throw new InvalidInputError("The recording is empty.");
    const { text } = await this.stt.transcribe(audio, language, { mimeType });
    return { text: text.trim() };
  }
}
