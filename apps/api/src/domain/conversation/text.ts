/** Speech-to-text output varies in case and end punctuation; ignore both when matching. */
export function sameText(a: string, b: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[.,!?;:]+$/, "");
  return normalize(a) === normalize(b);
}

/** On-screen help must not give away the correction the learner is working on. */
export function safeSupport(support: string | null, correction: string | undefined): string | null {
  const text = support?.trim() ?? "";
  if (!text) return null;
  if (correction && text.toLowerCase().includes(correction.trim().toLowerCase())) return null;
  return text;
}
