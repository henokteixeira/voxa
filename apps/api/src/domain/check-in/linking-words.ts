/**
 * Words that link one idea to another (a reason, a contrast, a condition): answers that use them say more than a list
 * of short sentences. Only words that nearly always link ideas: "so", "then", "when" and "which" are left out, since
 * learners also use them as fillers, for a sequence or in questions. Kept per language; a language without a list is
 * not measured.
 */
const LINKING_WORDS: Record<string, ReadonlySet<string>> = {
  en: new Set([
    "because",
    "cause",
    "but",
    "although",
    "though",
    "however",
    "if",
    "unless",
    "while",
    "since",
    "instead",
    "otherwise",
  ]),
};

/** How many linking words the text has; null when there is no list for the language (BCP 47). */
export function countLinkingWords(text: string, language: string): number | null {
  const words = LINKING_WORDS[language.toLowerCase().split("-")[0] ?? ""];
  if (!words) return null;
  return text
    .toLowerCase()
    .split(/[^\p{L}']+/u)
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter((word) => words.has(word)).length;
}

/** Linking words per 100 words, rounded to one decimal; null without a list for the language or without words. */
export function linkingWordsPer100(text: string, language: string, spokenWords: number): number | null {
  const count = countLinkingWords(text, language);
  if (count === null || spokenWords === 0) return null;
  return Math.round((count / spokenWords) * 1000) / 10;
}
