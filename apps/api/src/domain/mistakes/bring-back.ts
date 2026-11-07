import type { SessionPattern } from "../ports/mistake.repository.js";
import type { KnownPattern } from "./pattern.js";

/**
 * How many learner turns after a pattern was broken the tutor brings it back, with a new sentence (decided with
 * the user on 2026-11-07): late enough to need memory, soon enough to be within the same conversation.
 */
export const BRING_BACK_AFTER = { from: 3, to: 5 } as const;

/** The patterns whose answer could come in the learner's next turn, the most recently broken first. */
export function patternsToBringBack(patterns: readonly SessionPattern[], nextTurn: number): KnownPattern[] {
  return patterns
    .filter((p) => nextTurn - p.lastTurn >= BRING_BACK_AFTER.from && nextTurn - p.lastTurn <= BRING_BACK_AFTER.to)
    .toSorted((a, b) => b.lastTurn - a.lastTurn)
    .map(({ key, name }) => ({ key, name }));
}
