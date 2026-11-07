import type { ReviewSubject } from "@/lib/api";

export const PRACTICE_PATH = "/mistakes";
export const REVIEW_PATH = "/review";

/** The review of one pattern or new word; without one, the review of what is due. */
export function reviewPath(subject?: ReviewSubject): string {
  if (!subject) return REVIEW_PATH;
  return `${REVIEW_PATH}?${subject.kind === "pattern" ? "pattern" : "word"}=${encodeURIComponent(subject.id)}`;
}

/** The id the Practice tab gives the new words, listed beside the mistake types. */
export const NEW_WORDS_TYPE = "new_words";
/** The id of the mistakes saved before patterns, listed after the types. */
export const EARLIER_TYPE = "earlier";

/** A type's page in the Practice tab: its patterns in groups (or the new words, or the earlier mistakes). */
export function typePath(type: string): string {
  return `${PRACTICE_PATH}/types/${encodeURIComponent(type)}`;
}

/** A pattern's page in the Practice tab. */
export function patternPath(id: string): string {
  return `${PRACTICE_PATH}/patterns/${encodeURIComponent(id)}`;
}
