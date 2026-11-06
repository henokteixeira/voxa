export interface Transcription {
  text: string;
  language: string;
}

export interface SpeechToTextPort {
  transcribe(audio: Buffer, language: string): Promise<Transcription>;
}

export interface TextToSpeechPort {
  /** Retorna áudio (WAV) da fala. */
  synthesize(text: string, language: string): Promise<Buffer>;
}

export const STT_PORT = Symbol("STT_PORT");
export const TTS_PORT = Symbol("TTS_PORT");
