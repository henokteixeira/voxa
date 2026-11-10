import type { MistakePattern } from "../mistakes/pattern.js";
import type { Mistake } from "./mistake.repository.js";

/** Why the learner says a record is not a mistake. */
export const DISMISS_REASONS = ["transcript_error", "both_correct", "not_needed"] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number];

/** A mistake in the bank, with what happened each time it showed up. */
export interface BankEntry extends Mistake {
  /** Sessions, after the latest time the mistake was made, in which the learner used the correct form. */
  sessionsCorrect: number;
  /** Times it came up as a mistake that got in the way of understanding (a hint paused the talk for it). */
  seriousOccurrences: number;
  /** The rule it breaks; null for new words and for mistakes saved before patterns. */
  pattern: MistakePattern | null;
}

/** Reading and curating the mistake bank. The concrete implementation lives in infra/. */
export interface MistakeBankRepository {
  /** Every mistake in this language that was not dismissed, most recently seen first. */
  list(language: string): Promise<BankEntry[]>;
  /**
   * Takes a mistake out of the bank for good: it is no longer listed, watched by the tutor
   * or counted again. Returns false when no such mistake exists.
   */
  dismiss(id: string, reason: DismissReason): Promise<boolean>;
}

export const MISTAKE_BANK_REPOSITORY = Symbol("MISTAKE_BANK_REPOSITORY");
