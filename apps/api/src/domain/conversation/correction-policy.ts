import type { Issue, PendingCorrection } from "./types.js";

/** After this many hints the tutor shows the correct form and asks the learner to repeat it. */
export const MAX_HINTS = 2;

export interface TutorVerdict {
  /** The tutor's natural reply, used when the conversation goes on. */
  reply: string;
  /** Mistakes in the learner's last utterance. */
  issues: Issue[];
  /** When a correction is pending: did the learner fix it in this utterance? */
  pendingResolved: boolean;
  /** When a correction is pending and not fixed: a new, more specific clue. */
  nextHint: string | null;
  /** Known mistakes (by their `original`) the learner said correctly in this utterance, without a hint. */
  correctUses: string[];
}

export type TurnKind = "reply" | "hint" | "reveal";

export interface PolicyDecision {
  kind: TurnKind;
  /** What the tutor says now. */
  message: string;
  nextPending: PendingCorrection | null;
  /** True when the learner fixed a pending correction after a hint. */
  selfCorrected: boolean;
}

/**
 * Hint-based correction rules:
 * - a serious mistake (hurts understanding or already in the bank) pauses the conversation with a hint;
 * - a minor mistake is only recorded, for the end-of-session summary;
 * - up to MAX_HINTS hints, then the correct form and a request to repeat it.
 */
export function decide(pending: PendingCorrection | null, verdict: TutorVerdict): PolicyDecision {
  if (pending?.revealed) {
    return { kind: "reply", message: verdict.reply, nextPending: null, selfCorrected: false };
  }

  if (pending) {
    if (verdict.pendingResolved) {
      return { kind: "reply", message: verdict.reply, nextPending: null, selfCorrected: true };
    }
    if (pending.hintsGiven < MAX_HINTS) {
      return {
        kind: "hint",
        message: safeHint(verdict.nextHint, pending),
        nextPending: { ...pending, hintsGiven: pending.hintsGiven + 1 },
        selfCorrected: false,
      };
    }
    return {
      kind: "reveal",
      message: `Here is one way to say it: "${pending.correction}". Try saying it yourself.`,
      nextPending: { ...pending, revealed: true },
      selfCorrected: false,
    };
  }

  const serious = verdict.issues.find(isSerious);
  if (serious) {
    return {
      kind: "hint",
      message: safeHint(serious.hint, serious),
      nextPending: {
        original: serious.original,
        correction: serious.correction,
        category: serious.category,
        hintsGiven: 1,
        revealed: false,
      },
      selfCorrected: false,
    };
  }

  return { kind: "reply", message: verdict.reply, nextPending: null, selfCorrected: false };
}

export function isSerious(issue: Issue): boolean {
  return issue.severity === "serious" || issue.matchesKnownMistake;
}

/**
 * A hint must push the learner to fix the sentence alone, so it never carries the corrected sentence.
 * When the tutor gives no usable hint, fall back to a generic clue that names the kind of mistake.
 */
export function safeHint(hint: string | null | undefined, target: { correction: string; category: string }): string {
  const text = hint?.trim() ?? "";
  const leaksAnswer = text.toLowerCase().includes(target.correction.trim().toLowerCase());
  if (!text || leaksAnswer) {
    return `Let's try that once more. Look at the ${target.category.replaceAll("_", " ")} in that sentence.`;
  }
  return text;
}
