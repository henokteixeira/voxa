import type { SessionSignals } from "../progress/signal-trend.js";
import { CEFR_LEVELS, type CefrLevel, supportStepFor } from "./speaking-level.js";

/**
 * When to propose a different support step (leveling and guided track design, approved by the learner on
 * 2026-11-07). The learner always confirms it; nothing changes on its own. The thresholds are design choices.
 */

/** Sessions in a row the rule looks at. */
export const STEP_WINDOW = 3;
/** Up: at least this share of the answers had no help, in each of the sessions. */
export const STEP_UP_SHARE = 0.8;
/** Down: less than this share of the answers had no help, in each of the sessions. */
export const STEP_DOWN_SHARE = 0.4;

export interface StepChangeProposal {
  direction: "up" | "down";
  /** The level to move to: the nearest one whose support step differs from the current one. */
  to: CefrLevel;
}

/** The nearest level up or down that gives a different support step, or null at the end of the scale. */
export function nextStepLevel(level: CefrLevel, direction: "up" | "down"): CefrLevel | null {
  const step = supportStepFor(level);
  const index = CEFR_LEVELS.indexOf(level);
  const candidates = direction === "up" ? CEFR_LEVELS.slice(index + 1) : CEFR_LEVELS.slice(0, index).reverse();
  return candidates.find((candidate) => supportStepFor(candidate) !== step) ?? null;
}

/**
 * The proposal from the sessions since the current level was set, newest first (older ones were judged at
 * another step). Sessions that did not measure the share of answers without help are skipped.
 * Up also needs the long pauses not to have risen: the newest session's rate is not above the oldest one's.
 */
export function proposeStepChange(level: CefrLevel, sessions: readonly SessionSignals[]): StepChangeProposal | null {
  const window = sessions.filter((s) => s.unaidedShare !== null).slice(0, STEP_WINDOW);
  if (window.length < STEP_WINDOW) return null;
  const shares = window.map((s) => s.unaidedShare ?? 0);
  const newest = window[0].longPausesPerMinute;
  const oldest = window[STEP_WINDOW - 1].longPausesPerMinute;
  const pausesRose = newest !== null && oldest !== null && newest > oldest;

  const direction = shares.every((share) => share >= STEP_UP_SHARE) && !pausesRose
    ? "up"
    : shares.every((share) => share < STEP_DOWN_SHARE)
      ? "down"
      : null;
  if (!direction) return null;
  const to = nextStepLevel(level, direction);
  return to ? { direction, to } : null;
}
