import type { Issue, PendingCorrection } from "./types.js";

/** After this many hints the tutor shows the correct form. Confirmed by Henok on 2026-11-06. */
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
    if (pending.hintsGiven < MAX_HINTS && verdict.nextHint) {
      return {
        kind: "hint",
        message: verdict.nextHint,
        nextPending: { ...pending, hintsGiven: pending.hintsGiven + 1 },
        selfCorrected: false,
      };
    }
    return {
      kind: "reveal",
      message: `Here is one way to say it: "${pending.correction}". Now say it yourself.`,
      nextPending: { ...pending, revealed: true },
      selfCorrected: false,
    };
  }

  const serious = verdict.issues.find(isSerious);
  if (serious) {
    return {
      kind: "hint",
      message: serious.hint,
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
