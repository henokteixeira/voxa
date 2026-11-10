import type { FluencySignals } from "../conversation/fluency.js";

/**
 * Inferred confidence (leveling and guided track design, approved by the learner on 2026-11-07): instead of asking
 * how ready the learner feels, each session's signals are compared with the sessions before it.
 */

/** The fluency signals plus how much the learner said without help. */
export interface SessionSignals extends FluencySignals {
  /** Share (0–1) of the learner's turns without help (no words given by the tutor, no first language). */
  unaidedShare: number | null;
}

export type SignalName = keyof SessionSignals;

/** Whether a higher value is better, and how big a change must be to count (a design choice, to tune with use). */
const SIGNALS: Record<SignalName, { higherIsBetter: boolean; tolerance: { kind: "relative" | "absolute"; value: number } }> = {
  wordsPerMinute: { higherIsBetter: true, tolerance: { kind: "relative", value: 0.1 } },
  wordsPerAnswer: { higherIsBetter: true, tolerance: { kind: "relative", value: 0.1 } },
  longPausesPerMinute: { higherIsBetter: false, tolerance: { kind: "relative", value: 0.1 } },
  averagePauseMs: { higherIsBetter: false, tolerance: { kind: "relative", value: 0.1 } },
  mistakesPer100Words: { higherIsBetter: false, tolerance: { kind: "relative", value: 0.1 } },
  // Shares move in big jumps on few turns: they need ten points either way.
  unaidedShare: { higherIsBetter: true, tolerance: { kind: "absolute", value: 0.1 } },
  selfCorrectionRate: { higherIsBetter: true, tolerance: { kind: "absolute", value: 0.1 } },
};

/** The order the app shows the signals in. */
export const SIGNAL_NAMES: readonly SignalName[] = [
  "unaidedShare",
  "wordsPerMinute",
  "wordsPerAnswer",
  "longPausesPerMinute",
  "averagePauseMs",
  "mistakesPer100Words",
  "selfCorrectionRate",
];

/** How many earlier sessions a session is compared with. */
export const COMPARED_SESSIONS = 3;

export type Trend = "better" | "steady" | "worse";

export interface SignalTrend {
  name: SignalName;
  current: number;
  /** The average of this signal over the earlier sessions that measured it. */
  baseline: number;
  trend: Trend;
}

export interface SignalComparison {
  /** How many earlier sessions the session was compared with (1 to COMPARED_SESSIONS). */
  sessions: number;
  /** Only the signals both this session and an earlier one measured, in SIGNAL_NAMES order. */
  signals: SignalTrend[];
}

export function trendOf(name: SignalName, current: number, baseline: number): Trend {
  const { higherIsBetter, tolerance } = SIGNALS[name];
  const change = current - baseline;
  const size = tolerance.kind === "absolute" ? Math.abs(change) : baseline === 0 ? Infinity : Math.abs(change) / baseline;
  if (change === 0 || size < tolerance.value) return "steady";
  return change > 0 === higherIsBetter ? "better" : "worse";
}

/**
 * Compares a session with the ones before it (newest first; only the first COMPARED_SESSIONS count).
 * Null when there is nothing to compare: no earlier session, or no signal measured in both.
 */
export function compareSignals(current: SessionSignals, earlier: readonly SessionSignals[]): SignalComparison | null {
  const previous = earlier.slice(0, COMPARED_SESSIONS);
  if (previous.length === 0) return null;
  const signals = SIGNAL_NAMES.flatMap((name): SignalTrend[] => {
    const value = current[name];
    const measured = previous.flatMap((s) => (s[name] === null ? [] : [s[name]]));
    if (value === null || measured.length === 0) return [];
    const baseline = measured.reduce((a, b) => a + b, 0) / measured.length;
    return [{ name, current: value, baseline, trend: trendOf(name, value, baseline) }];
  });
  return signals.length ? { sessions: previous.length, signals } : null;
}

/** The share of the learner's turns said without help, or null when they said nothing. */
export function unaidedShare(turns: { total: number; assisted: number }): number | null {
  return turns.total ? (turns.total - turns.assisted) / turns.total : null;
}
