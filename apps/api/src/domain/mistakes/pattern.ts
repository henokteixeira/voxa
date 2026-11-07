/** The rule a mistake breaks. Many sentences share one pattern, so the learner reviews the rule, not one sentence. */
export interface MistakePattern {
  /** Stable id within a language, in snake_case English (e.g. "past_simple_finished_action"). */
  key: string;
  /** A short label in the language being learned (e.g. "Past for finished actions"). */
  name: string;
  /** The rule in one line, in the learner's first language. */
  rule: string;
}

/** A pattern the learner already has in the bank, as the tutor sees it so it can reuse the key. */
export type KnownPattern = Pick<MistakePattern, "key" | "name">;

const MAX_KEY_LENGTH = 64;

/**
 * The pattern as it is stored: trimmed, with the key in snake_case. Null when the key or the name is empty,
 * so a broken pattern never groups unrelated mistakes.
 */
export function cleanPattern(pattern: MistakePattern | null | undefined): MistakePattern | null {
  if (!pattern) return null;
  const key = pattern.key
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_KEY_LENGTH)
    .replace(/_+$/, "");
  const name = pattern.name.trim();
  if (!key || !name) return null;
  // The rule is shown as one line.
  return { key, name, rule: pattern.rule.replace(/\s+/g, " ").trim() };
}
