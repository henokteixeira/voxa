import { mistakeStatus } from "../mistakes/mistake-status.js";
import type { BankEntry } from "../ports/mistake-bank.repository.js";
import { sameText } from "./text.js";
import { NEW_WORD_CATEGORY, type PendingCorrection, type PracticeTarget } from "./types.js";

/** How many mistakes from the bank each session practices. */
export const PRACTICE_TARGETS = 2;

/** The most frequent mistakes the learner has not mastered yet. New words are not mistakes. */
export function choosePracticeTargets(entries: readonly BankEntry[]): PracticeTarget[] {
  return entries
    .filter((m) => m.category !== NEW_WORD_CATEGORY && mistakeStatus(m.sessionsCorrect) !== "mastered")
    .toSorted((a, b) => b.occurrences - a.occurrences)
    .slice(0, PRACTICE_TARGETS)
    .map(({ original, correction, category }) => ({ original, correction, category }));
}

/**
 * The targets met after this turn. A target is met by the correct form said without a hint, even if the
 * mistake also came up this session; the retry of the pending mistake came after a hint, so it does not count.
 */
export function metTargetsAfter(turn: {
  targets: readonly PracticeTarget[];
  alreadyMet: readonly string[];
  correctUses: readonly string[];
  pending: PendingCorrection | null;
}): string[] {
  const { pending } = turn;
  return turn.targets
    .map((t) => t.original)
    .filter(
      (original) =>
        turn.alreadyMet.includes(original) ||
        (turn.correctUses.some((u) => sameText(u, original)) && !(pending && sameText(pending.original, original))),
    );
}
