import type { Severity } from "./types.js";

/** Timing the web app measures during a live session. Typed turns add words but no speech or pause. */
export interface SessionTiming {
  /** Total time the learner spoke. */
  learnerSpeechMs: number;
  /** Total time the tutor's voice played. */
  tutorSpeechMs: number;
  /** For each spoken answer: from the end of the tutor's voice to the start of the learner's speech. */
  pausesMs: number[];
}

/** The 4 fluency signals of a session. Null when the session gives nothing to measure. */
export interface FluencySignals {
  /** Share (0–1) of the mistakes that got a hint which the learner then fixed alone. */
  selfCorrectionRate: number | null;
  /** Mistakes of the session for every 100 words the learner said. */
  mistakesPer100Words: number | null;
  /** Average pause before answering, in milliseconds. */
  averagePauseMs: number | null;
  /** Share (0–1) of the speaking time that was the learner's. */
  speakingShare: number | null;
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export function fluencySignals(input: {
  mistakes: { severity: Severity; selfCorrected: boolean }[];
  learnerUtterances: string[];
  timing: SessionTiming | null;
}): FluencySignals {
  const { mistakes, learnerUtterances, timing } = input;
  // Serious mistakes are the ones the tutor stops for with a hint.
  const hinted = mistakes.filter((m) => m.severity === "serious");
  const words = learnerUtterances.reduce((sum, text) => sum + countWords(text), 0);
  const pauses = timing?.pausesMs ?? [];
  const speech = timing ? timing.learnerSpeechMs + timing.tutorSpeechMs : 0;

  return {
    selfCorrectionRate: hinted.length ? hinted.filter((m) => m.selfCorrected).length / hinted.length : null,
    mistakesPer100Words: words ? (mistakes.length / words) * 100 : null,
    averagePauseMs: pauses.length ? Math.round(pauses.reduce((a, b) => a + b, 0) / pauses.length) : null,
    speakingShare: timing && speech ? timing.learnerSpeechMs / speech : null,
  };
}
