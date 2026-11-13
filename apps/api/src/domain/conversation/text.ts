import type { PendingCorrection } from "./types.js";

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

/**
 * The rule a pending mistake breaks, as the screen shows it: with the hint (decided on 2026-11-13, so the learner knows
 * what to fix) and with the correct form. Before the correct form, a rule that would give the corrected words away is
 * not shown.
 */
export function shownRule(pending: PendingCorrection | null): { name: string; rule: string } | null {
  const pattern = pending?.pattern;
  if (!pending || !pattern) return null;
  if (pending.revealed) return pattern;
  const safe = (text: string) => safeSupport(text, pending.correction) !== null;
  return safe(pattern.name) && safe(pattern.rule) ? pattern : null;
}
