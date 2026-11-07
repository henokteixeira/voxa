import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { type DueReview, REVIEW_REPOSITORY, type ReviewRepository } from "../domain/ports/review.repository.js";

/** How many items one review asks for: short enough for about three minutes by voice. */
export const REVIEW_SIZE = 5;

export interface ReviewOverview {
  /** The items to review now, at most REVIEW_SIZE, the longest overdue first. */
  due: DueReview[];
  /** When the next item comes back, when nothing else is due before it; null when the bank is empty. */
  nextDueAt: Date | null;
}

@Injectable()
export class ReviewService {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: ReviewRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async overview(language: string): Promise<ReviewOverview> {
    const now = this.clock.now();
    const [due, nextDueAt] = await Promise.all([
      this.reviews.due(language, now, REVIEW_SIZE),
      this.reviews.nextDueAt(language, now),
    ]);
    return { due, nextDueAt };
  }
}
