import { Inject, Injectable } from "@nestjs/common";
import { DomainError } from "../domain/errors.js";
import { fillerLinesFor } from "../domain/conversation/fillers.js";
import { TTS_PORT, type TextToSpeechPort } from "../domain/ports/voice.port.js";

export class FillerNotFoundError extends DomainError {
  readonly code = "not_found";

  constructor(language: string, index: number) {
    super(`No filler line ${index} for ${language}.`, "Filler not found.");
  }
}

/** Enough for every line in a handful of language tags; any tag is valid input, so the cache is bounded. */
const MAX_CACHED = 50;

/** Speaks the filler lines in the tutor's voice, once each: the same line always sounds the same. */
@Injectable()
export class FillerSpeechService {
  private readonly cache = new Map<string, Promise<Buffer>>();

  constructor(@Inject(TTS_PORT) private readonly tts: TextToSpeechPort) {}

  count(language: string): number {
    return fillerLinesFor(language).length;
  }

  /** The line's speech (WAV). A failed synthesis is not cached, so the next request tries again. */
  speech(language: string, index: number): Promise<Buffer> {
    const line = fillerLinesFor(language)[index];
    if (line === undefined) return Promise.reject(new FillerNotFoundError(language, index));
    const key = `${language}\u0000${index}`;
    let speech = this.cache.get(key);
    if (!speech) {
      if (this.cache.size >= MAX_CACHED) this.cache.clear();
      speech = this.tts.synthesize(line, language);
      this.cache.set(key, speech);
      speech.catch(() => this.cache.delete(key));
    }
    return speech;
  }
}
