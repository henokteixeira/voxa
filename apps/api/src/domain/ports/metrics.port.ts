/** How long each stage of one spoken (or typed) turn took, from the end of the learner's speech to the tutor's voice. */
export interface VoiceTurnTiming {
  sessionId: string;
  /** Null for a typed turn. */
  sttMs: number | null;
  tutorMs: number;
  ttsMs: number;
  totalMs: number;
}

/** One call to the AI model: what it was for, how it ran, the tokens it used and how long it took. */
export interface ModelCall {
  /** The kind of call, e.g. tutor_turn or review_check. */
  task: string;
  model: string;
  effort: string;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  durationMs: number;
  /** The call failed or its answer could not be used. */
  failed: boolean;
}

/**
 * Keeps measurements to decide on speed and cost with data. Best effort: it never rejects and never slows the
 * learner down; a failure to record is only logged. Implementations live in infra/.
 */
export interface MetricsRecorder {
  voiceTurn(timing: VoiceTurnTiming): Promise<void>;
  modelCall(call: ModelCall): Promise<void>;
}

export const METRICS_RECORDER = Symbol("METRICS_RECORDER");
