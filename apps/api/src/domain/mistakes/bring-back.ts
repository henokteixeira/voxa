import type { SessionPattern } from "../ports/mistake.repository.js";
import type { KnownPattern } from "./pattern.js";

/**
 * How many learner turns after a pattern was last broken the tutor brings it back, with a new sentence. The
 * user chose 3 to 5 (2026-11-07); it is asked once, at 3, so the conversation never turns into a drill.
 */
export const BRING_BACK_AFTER_TURNS = 3;

/** The patterns whose answer should come in the learner's next turn. */
export function patternsToBringBack(patterns: readonly SessionPattern[], nextTurn: number): KnownPattern[] {
  return patterns.filter((p) => nextTurn - p.lastTurn === BRING_BACK_AFTER_TURNS).map(({ key, name }) => ({ key, name }));
}
