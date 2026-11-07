import { NEW_WORD_CATEGORY } from "../conversation/types.js";
import type { SessionMistake } from "../ports/mistake.repository.js";

/** How many patterns the summary asks the learner to take away (decided with the user on 2026-11-07). */
export const MAX_TAKEAWAYS = 3;

/** A pattern from the session for the learner to keep, with the words they said that broke it. */
export interface Takeaway {
  patternId: string;
  category: string;
  name: string;
  rule: string;
  /** The learner's words, from the most important time they broke it. */
  said: string;
}

/**
 * At most MAX_TAKEAWAYS patterns from the session: serious ones first, then those broken more than once in the
 * session, then those broken in earlier sessions, then in the order they came up.
 */
export function chooseTakeaways(mistakes: readonly SessionMistake[]): Takeaway[] {
  const groups = new Map<string, { takeaway: Takeaway; serious: boolean; times: number; seenBefore: boolean; first: number }>();
  mistakes.forEach((m, index) => {
    if (m.category === NEW_WORD_CATEGORY || !m.patternId || !m.pattern) return;
    const group = groups.get(m.patternId);
    const serious = m.severity === "serious";
    if (!group) {
      groups.set(m.patternId, {
        takeaway: { patternId: m.patternId, category: m.category, name: m.pattern.name, rule: m.pattern.rule, said: m.original },
        serious,
        times: 1,
        seenBefore: m.patternSeenBefore,
        first: index,
      });
      return;
    }
    group.times += 1;
    group.seenBefore ||= m.patternSeenBefore;
    if (serious && !group.serious) group.takeaway.said = m.original;
    group.serious ||= serious;
  });
  return [...groups.values()]
    .toSorted(
      (a, b) =>
        Number(b.serious) - Number(a.serious) ||
        Number(b.times > 1) - Number(a.times > 1) ||
        Number(b.seenBefore) - Number(a.seenBefore) ||
        a.first - b.first,
    )
    .slice(0, MAX_TAKEAWAYS)
    .map((g) => g.takeaway);
}
