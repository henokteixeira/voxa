/**
 * Words that link one idea to another (a reason, a contrast, a result, a condition): answers that use them say more
 * than a list of short sentences. Kept per language; a language without a list is not measured.
 */
const LINKING_WORDS: Record<string, ReadonlySet<string>> = {
  en: new Set([
    "because",
    "so",
    "but",
    "although",
    "though",
    "however",
    "if",
    "unless",
    "when",
    "while",
    "since",
    "which",
    "then",
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
    .filter((word) => words.has(word)).length;
}
