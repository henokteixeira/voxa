import type { ReviewSubject } from "@/lib/api";

export const PRACTICE_PATH = "/mistakes";
export const REVIEW_PATH = "/review";

/** The review of one pattern or new word; without one, the review of what is due. */
export function reviewPath(subject?: ReviewSubject): string {
  if (!subject) return REVIEW_PATH;
  return `${REVIEW_PATH}?${subject.kind === "pattern" ? "pattern" : "word"}=${encodeURIComponent(subject.id)}`;
}
