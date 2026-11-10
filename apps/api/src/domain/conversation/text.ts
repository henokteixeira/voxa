/** Speech-to-text output varies in case and end punctuation; ignore both when matching. */
export function sameText(a: string, b: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[.,!?;:]+$/, "");
  return normalize(a) === normalize(b);
}

/**
 * Ready-made expressions are stored with "…" where the learner's words go; a model copying one back may write "...",
 * drop the ending or curl the apostrophe. Ignore all of that when matching.
 */
export function samePhrase(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/(…|\.{3}|[.,!?;:\s])+$/u, "");
  return normalize(a) === normalize(b);
}

/** On-screen help must not give away the correction the learner is working on. */
export function safeSupport(support: string | null, correction: string | undefined): string | null {
  const text = support?.trim() ?? "";
  if (!text) return null;
  if (correction && text.toLowerCase().includes(correction.trim().toLowerCase())) return null;
  return text;
}
