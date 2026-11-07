/**
 * The kinds of mistakes the tutor sorts into (decided with the user on 2026-11-07). Records saved before
 * this list may still carry older, broader categories (grammar, vocabulary).
 */
export const MISTAKE_TYPES = [
  "verb_tense",
  "agreement",
  "sentence_structure",
  "articles_prepositions",
  "word_choice",
  "expression",
  "pronunciation",
] as const;
export type MistakeType = (typeof MISTAKE_TYPES)[number];
