import { Inject, Injectable } from "@nestjs/common";
import { NEW_WORD_CATEGORY } from "../domain/conversation/types.js";
import type { Mistake } from "../domain/ports/mistake.repository.js";
import { REVIEW_REPOSITORY, type ReviewRepository, type ReviewSubject } from "../domain/ports/review.repository.js";
import { countsAsReview, firstReview, nextReview, type ReviewOutcome, type ReviewState } from "../domain/review/review-schedule.js";

/** What a mistake is reviewed as: its pattern, the word itself for a new word, or nothing (no pattern yet). */
export function reviewSubject(mistake: Pick<Mistake, "id" | "category" | "patternId">): ReviewSubject | null {
  if (mistake.category === NEW_WORD_CATEGORY) return { kind: "new_word", id: mistake.id };
  return mistake.patternId ? { kind: "pattern", id: mistake.patternId } : null;
}

/** Moves review schedules as the learner speaks: in sessions and in reviews. */
@Injectable()
export class ReviewScheduler {
  constructor(@Inject(REVIEW_REPOSITORY) private readonly reviews: Pick<ReviewRepository, "state" | "save">) {}

  /** The mistake was made (or the word said in the first language): first review tomorrow, or one step back. */
  async made(language: string, subject: ReviewSubject, now: Date): Promise<void> {
    const state = await this.reviews.state(subject);
    await this.reviews.save(language, subject, state ? nextReview(state, "missed", now) : firstReview(now), null);
  }

  /** Said right in a conversation, without a hint: counts as a review only once it is due. */
  async usedCorrectly(language: string, subject: ReviewSubject, now: Date): Promise<void> {
    const state = await this.reviews.state(subject);
    if (!state || !countsAsReview(state, now)) return;
    await this.reviews.save(language, subject, nextReview(state, "recalled", now), now);
  }

  /**
   * An answer in a review, or in extra practice of an item that is not due yet; returns the new schedule.
   * Extra practice said right leaves the schedule as it is, so practicing early never skips a step.
   */
  async answered(language: string, subject: ReviewSubject, outcome: ReviewOutcome, now: Date): Promise<ReviewState> {
    const state = (await this.reviews.state(subject)) ?? firstReview(now);
    if (outcome === "recalled" && !countsAsReview(state, now)) return state;
    const next = nextReview(state, outcome, now);
    await this.reviews.save(language, subject, next, now);
    return next;
  }
}
