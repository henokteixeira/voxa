import { mistakeStatus } from "../mistakes/mistake-status.js";
import type { BankEntry } from "../ports/mistake-bank.repository.js";
import type { HintFocus } from "./correction-policy.js";
import type { KnownPattern } from "../mistakes/pattern.js";
import { sameText } from "./text.js";
import { NEW_WORD_CATEGORY, type PendingCorrection, type PracticeTarget } from "./types.js";

/** How many mistakes from the bank each session practices. */
export const PRACTICE_TARGETS = 2;

/**
 * Patterns due for review first (decided with the user on 2026-11-07): one sentence each. Then the mistakes the
 * learner has not mastered yet. Within each, mistakes that got in the way of understanding come before the ones
 * that did not, and then the most frequent (2026-11-10: the most frequent small slips, such as articles, matter
 * least to being understood). New words are not mistakes.
 */
export function choosePracticeTargets(entries: readonly BankEntry[], duePatterns: ReadonlySet<string> = new Set()): PracticeTarget[] {
  const open = entries
    .filter((m) => m.category !== NEW_WORD_CATEGORY && mistakeStatus(m.sessionsCorrect) !== "mastered")
    .toSorted((a, b) => Number(b.seriousOccurrences > 0) - Number(a.seriousOccurrences > 0) || b.occurrences - a.occurrences);
  const chosen: BankEntry[] = [];
  const patterns = new Set<string>();
  for (const m of open) {
    if (chosen.length === PRACTICE_TARGETS) break;
    if (m.patternId && duePatterns.has(m.patternId) && !patterns.has(m.patternId)) {
      chosen.push(m);
      patterns.add(m.patternId);
    }
  }
  for (const m of open) {
    if (chosen.length === PRACTICE_TARGETS) break;
    // As before patterns were due: the most frequent, skipping only the due patterns already practiced.
    if (!chosen.includes(m) && !(m.patternId && patterns.has(m.patternId))) chosen.push(m);
  }
  return chosen.map(({ original, correction, category }) => ({ original, correction, category }));
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

/**
 * The patterns a session works on (due for review, or behind one of its targets), and those already broken in it:
 * together they decide which small known mistakes pause the talk for a hint.
 */
export function hintFocus(input: {
  entries: readonly BankEntry[];
  duePatterns: ReadonlySet<string>;
  targets: readonly PracticeTarget[];
  sessionPatterns: readonly KnownPattern[];
}): HintFocus {
  const { entries, duePatterns, targets, sessionPatterns } = input;
  const patterns = new Map(
    entries.flatMap((e) =>
      e.pattern && e.patternId && (duePatterns.has(e.patternId) || targets.some((t) => sameText(t.original, e.original)))
        ? [[e.pattern.key, e.pattern.name] as const]
        : [],
    ),
  );
  return { patterns, brokenThisSession: new Set(sessionPatterns.map((p) => p.key)) };
}
