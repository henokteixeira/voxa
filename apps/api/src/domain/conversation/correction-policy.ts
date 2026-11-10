import { correctsMistakes, type Mode } from "./mode.js";
import { cleanPattern } from "../mistakes/pattern.js";
import type { Issue, NewWord, PendingCorrection } from "./types.js";

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
  /** Words the learner said in their first language: saved to learn, never counted as mistakes. */
  newWords: NewWord[];
  /** A short line in the learner's first language, shown on screen only (never spoken), or null. */
  support: string | null;
  /** Ids of the session goals this utterance covers. */
  coveredGoals: string[];
  /** The learner could not answer: said they don't know, answered mostly in their first language, or gave up mid-sentence. */
  stuck: boolean;
  /** Words `reply` gives the learner to say next (a model sentence or a sentence start), as spoken; or null. */
  scaffold: string | null;
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
 * - a serious mistake (hurts understanding, or a known one in focus: see focusedVerdict) pauses the conversation with a hint;
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
        pattern: serious.pattern ? { name: serious.pattern.name, rule: serious.pattern.rule } : null,
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

/** Which known mistakes may pause the conversation in this turn. */
export interface HintFocus {
  /** Keys of the patterns the session works on: due for review, or behind a practice target. */
  patternKeys: ReadonlySet<string>;
  /** Keys of the patterns already broken earlier in this session. */
  brokenThisSession: ReadonlySet<string>;
}

/**
 * A small mistake that repeats a known one pauses the talk only when its pattern is in focus, and only the first
 * time in the session; otherwise it is recorded for the summary and the review (decided on 2026-11-10, so a
 * growing bank does not turn every conversation into a string of hints). A mistake that gets in the way of
 * understanding always pauses.
 */
export function focusedVerdict(verdict: TutorVerdict, focus: HintFocus): TutorVerdict {
  const inFocus = (issue: Issue) => {
    const key = cleanPattern(issue.pattern)?.key;
    return key !== undefined && focus.patternKeys.has(key) && !focus.brokenThisSession.has(key);
  };
  return {
    ...verdict,
    issues: verdict.issues.map((i) =>
      i.matchesKnownMistake && i.severity === "minor" && !inFocus(i) ? { ...i, matchesKnownMistake: false } : i,
    ),
  };
}

/** Every mistake counts as minor, so none pauses the talk for a hint; they are still recorded. */
export function notedOnly(verdict: TutorVerdict): TutorVerdict {
  return { ...verdict, issues: verdict.issues.map((i) => ({ ...i, severity: "minor", matchesKnownMistake: false })) };
}

/** In a mode that only observes (the placement interview), every mistake counts as minor, so none gets a hint. */
export function verdictForMode(mode: Mode, verdict: TutorVerdict): TutorVerdict {
  return correctsMistakes(mode) ? verdict : notedOnly(verdict);
}
