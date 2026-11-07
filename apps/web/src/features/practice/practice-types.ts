import type { PracticeView, ReviewStatus } from "@/lib/api";
import { isDue } from "./format";
import { NEW_WORDS_TYPE } from "./paths";

/** What the Practice tab needs from a pattern or a new word to place it. */
export interface ReviewItemLike {
  status: ReviewStatus;
  dueAt: string | null;
}

export type StatusCounts = Record<ReviewStatus, number>;

/** One row of the Practice tab: a mistake type (or the new words) and how its items are going. */
export interface PracticeType {
  /** The mistake category, or NEW_WORDS_TYPE. */
  id: string;
  count: number;
  counts: StatusCounts;
  /** Items to review today (mastered ones never are). */
  due: number;
  /** When the first item not yet due comes back; null when there is none. */
  nextDueAt: string | null;
}

/** The items of a type in the order the learner reads them: due today, coming up (soonest first), mastered. */
export interface ItemGroups<T> {
  due: T[];
  upcoming: T[];
  mastered: T[];
}

export function statusCounts(items: ReviewItemLike[]): StatusCounts {
  const counts: StatusCounts = { new: 0, improving: 0, mastered: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

const byDueAt = (a: ReviewItemLike, b: ReviewItemLike) => {
  // Items without a date go last.
  if (a.dueAt === b.dueAt) return 0;
  if (a.dueAt === null) return 1;
  if (b.dueAt === null) return -1;
  return a.dueAt < b.dueAt ? -1 : 1;
};

export function groupItems<T extends ReviewItemLike>(items: T[], now: Date): ItemGroups<T> {
  const due: T[] = [];
  const upcoming: T[] = [];
  const mastered: T[] = [];
  for (const item of items) {
    if (item.status === "mastered") mastered.push(item);
    else if (isDue(item.dueAt, now)) due.push(item);
    else upcoming.push(item);
  }
  return { due, upcoming: [...upcoming].sort(byDueAt), mastered };
}

function describe(id: string, items: ReviewItemLike[], now: Date): PracticeType {
  const groups = groupItems(items, now);
  return {
    id,
    count: items.length,
    counts: statusCounts(items),
    due: groups.due.length,
    nextDueAt: groups.upcoming.find((i) => i.dueAt !== null)?.dueAt ?? null,
  };
}

/**
 * The rows of the Practice tab: one per mistake type that has patterns, plus the new words. Types with
 * something to review today come first (most first), then by their next review, and types with everything
 * mastered last. Empty types are left out, so the list never grows past the types plus one.
 */
export function practiceTypes(view: PracticeView, now: Date): PracticeType[] {
  const byCategory = new Map<string, ReviewItemLike[]>();
  for (const p of view.patterns) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p]);
  const types = [...byCategory].map(([id, items]) => describe(id, items, now));
  if (view.newWords.length > 0) types.push(describe(NEW_WORDS_TYPE, view.newWords, now));
  return types.sort((a, b) => {
    if (a.due !== b.due) return b.due - a.due;
    const aDone = a.nextDueAt === null && a.counts.mastered === a.count;
    const bDone = b.nextDueAt === null && b.counts.mastered === b.count;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return byDueAt({ status: "new", dueAt: a.nextDueAt }, { status: "new", dueAt: b.nextDueAt });
  });
}
