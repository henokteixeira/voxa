import type { Severity } from "./types.js";

/** Timing the web app measures during a live session. Typed turns add words but no speech or pause. */
export interface SessionTiming {
  /** Total time the learner spoke. */
  learnerSpeechMs: number;
  /** Total time the tutor's voice played. */
  tutorSpeechMs: number;
  /** For each spoken answer: from the end of the tutor's voice to the start of the learner's speech. */
  pausesMs: number[];
  /** Silences of at least 1 s inside the learner's spoken answers. Missing in sessions measured before it existed. */
  longPausesMs?: number[];
  /** Words the learner spoke (typed turns do not count). Missing in sessions measured before it existed. */
  spokenWords?: number;
}

/** The fluency signals of a session. Null when the session gives nothing to measure. */
export interface FluencySignals {
  /** Share (0–1) of the mistakes that got a hint which the learner then fixed alone. */
  selfCorrectionRate: number | null;
  /** Mistakes of the session for every 100 words the learner said. */
  mistakesPer100Words: number | null;
  /** Average pause before answering, in milliseconds. */
  averagePauseMs: number | null;
  /** Words the learner spoke per minute of his own speech (his pauses inside an answer included). */
  wordsPerMinute: number | null;
  /** Long silences inside his answers per minute of his own speech. */
  longPausesPerMinute: number | null;
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
  // Words and long pauses are measured from 2026-11-07 on; older sessions have no rate.
  const minutes = timing ? timing.learnerSpeechMs / 60_000 : 0;
  const spokenWords = timing?.spokenWords;
  const longPauses = timing?.longPausesMs;

  return {
    selfCorrectionRate: hinted.length ? hinted.filter((m) => m.selfCorrected).length / hinted.length : null,
    mistakesPer100Words: words ? (mistakes.length / words) * 100 : null,
    averagePauseMs: pauses.length ? Math.round(pauses.reduce((a, b) => a + b, 0) / pauses.length) : null,
    wordsPerMinute: minutes && spokenWords !== undefined ? Math.round(spokenWords / minutes) : null,
    longPausesPerMinute: minutes && longPauses ? longPauses.length / minutes : null,
  };
}
