/**
 * The app's sounds: soft marimba-like tones from the design system, synthesized in the browser (no files).
 * Rising notes mean progress, falling notes mean a pause. Named by what happened, not by how they sound.
 */

/** One note: frequency (Hz), start offset (s), length (s). */
export type Note = readonly [hz: number, at: number, length: number];

export const CUES = {
  /** The tutor finished: the microphone is open. */
  yourTurn: [
    [523, 0, 0.25],
    [784, 0.08, 0.35],
  ],
  /** The learner's turn was sent. */
  turnSent: [
    [784, 0, 0.25],
    [523, 0.08, 0.35],
  ],
  /** A hint card appears. */
  hint: [
    [587, 0, 0.4],
    [740, 0.16, 0.5],
  ],
  /** The learner fixed the mistake after a hint: the most valued moment. */
  selfCorrected: [
    [659, 0, 0.25],
    [784, 0.08, 0.25],
    [988, 0.16, 0.25],
    [1319, 0.24, 0.6],
  ],
  /** The correct form is shown after two hints. Gentle, never a "wrong" sound. */
  revealed: [
    [523, 0, 0.3],
    [659, 0.09, 0.3],
  ],
  /** A goal of the session is covered. */
  goalCovered: [
    [880, 0, 0.25],
    [1109, 0.1, 0.25],
    [1319, 0.2, 0.5],
  ],
  /** A new personal record. */
  record: [
    [523, 0, 0.3],
    [659, 0.09, 0.3],
    [784, 0.18, 0.5],
  ],
  /** The daily goal is met. */
  dailyGoal: [
    [392, 0, 0.35],
    [523, 0.13, 0.35],
    [659, 0.26, 0.35],
    [784, 0.39, 0.8],
  ],
  /** XP is counted on screen. */
  xp: [[1047, 0, 0.12]],
  /** A main button was pressed. */
  tap: [[1047, 0, 0.12]],
} as const satisfies Record<string, readonly Note[]>;

export type Cue = keyof typeof CUES;
