export interface Transcription {
  text: string;
  language: string;
  /** Length of the transcribed audio, when the engine reports it. */
  audioMs?: number;
  /** Time the engine took to transcribe, when it reports it. */
  processingMs?: number;
}

export interface TranscribeOptions {
  /** MIME type of the audio, e.g. "audio/webm" (default) or "audio/wav". */
  mimeType?: string;
}

export interface SpeechToTextPort {
  transcribe(audio: Buffer, language: string, options?: TranscribeOptions): Promise<Transcription>;
}

export interface TextToSpeechPort {
  /** Returns the speech audio (WAV). */
  synthesize(text: string, language: string): Promise<Buffer>;
}

/** The voice engine is unreachable, timed out or failed; the caller should show an error state. */
export class VoiceUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "VoiceUnavailableError";
  }
}

/** The voice engine rejected the request itself (empty audio, unsupported language, text too long). */
export class VoiceRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VoiceRequestError";
  }
}

export const STT_PORT = Symbol("STT_PORT");
export const TTS_PORT = Symbol("TTS_PORT");
