import type { ReviewItem } from "./review.repository.js";

/** What a review asks the learner to say, and one way to say it. */
export interface ReviewCue {
  /** A short sentence in the learner's first language, from their work, that needs the pattern (or the word). */
  cue: string;
  /** One natural way to say it in the language being learned. */
  answer: string;
}

/** How an answer went. */
export interface ReviewCheck {
  /** The whole answer is correct and uses the pattern, word or expression (stricter since 2026-11-13). */
  recalled: boolean;
  /** Another mistake in the answer, in one short line in the learner's first language; null when none. */
  otherMistake: string | null;
}

/** Writes review cues and checks the learner's answers. Implementations live in infra/. */
export interface ReviewCoachPort {
  /** A new cue for the item, different from the learner's own sentences, so the rule is practiced, not one sentence. */
  cue(item: ReviewItem, learnerContext: string): Promise<ReviewCue>;
  /** Whether the learner's whole answer says the cue correctly, and the other mistake in it, if any. */
  check(item: ReviewItem, cue: ReviewCue, utterance: string): Promise<ReviewCheck>;
}

export const REVIEW_COACH_PORT = Symbol("REVIEW_COACH_PORT");
