import type { ReviewItem } from "./review.repository.js";

/** What a review asks the learner to say, and one way to say it. */
export interface ReviewCue {
  /** A short sentence in the learner's first language, from their work, that needs the pattern (or the word). */
  cue: string;
  /** One natural way to say it in the language being learned. */
  answer: string;
}

/** Writes review cues and checks the learner's answers. Implementations live in infra/. */
export interface ReviewCoachPort {
  /** A new cue for the item, different from the learner's own sentences, so the rule is practiced, not one sentence. */
  cue(item: ReviewItem, learnerContext: string): Promise<ReviewCue>;
  /** True when the learner's answer says the cue with the pattern (or the word) right; other small slips don't count. */
  check(item: ReviewItem, cue: ReviewCue, utterance: string): Promise<boolean>;
}

export const REVIEW_COACH_PORT = Symbol("REVIEW_COACH_PORT");
