import { Inject, Injectable } from "@nestjs/common";
import { DomainError } from "../domain/errors.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { LEARNER_CONTEXT_PORT, type LearnerContextPort } from "../domain/ports/learner-context.port.js";
import { REVIEW_COACH_PORT, type ReviewCoachPort, type ReviewCue } from "../domain/ports/review-coach.port.js";
import {
  type ReviewItem,
  REVIEW_REPOSITORY,
  type ReviewRepository,
  type ReviewSubject,
} from "../domain/ports/review.repository.js";
import { ReviewScheduler } from "./review-scheduler.js";

/** How many items one review asks for: short enough for about three minutes by voice. */
export const REVIEW_SIZE = 5;

export class ReviewItemNotFoundError extends DomainError {
  readonly code = "not_found";

  constructor(subject: ReviewSubject) {
    super(`No review item for ${subject.kind} ${subject.id}.`, "That item is no longer in your practice.");
  }
}

export interface ReviewOverview {
  /** The items to review now, at most REVIEW_SIZE, the longest overdue first. */
  due: ReviewItem[];
  /** When the next item that is not due yet comes back; null when there is none. */
  nextDueAt: Date | null;
}

/** One question of a review: the item, and a new cue for it. */
export interface ReviewCard {
  item: ReviewItem;
  cue: ReviewCue;
}

export interface ReviewAnswer {
  recalled: boolean;
  /** One way to say the cue, shown after the answer. */
  answer: string;
  rule: string;
  /** When the item comes back. */
  nextDueAt: Date;
}

@Injectable()
export class ReviewService {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: ReviewRepository,
    @Inject(REVIEW_COACH_PORT) private readonly coach: ReviewCoachPort,
    @Inject(LEARNER_CONTEXT_PORT) private readonly learnerContext: LearnerContextPort,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly scheduler: ReviewScheduler,
  ) {}

  async overview(language: string): Promise<ReviewOverview> {
    const now = this.clock.now();
    const [due, nextDueAt] = await Promise.all([
      this.reviews.due(language, now, REVIEW_SIZE),
      this.reviews.nextDueAt(language, now),
    ]);
    return { due, nextDueAt };
  }

  /** A new cue for the item, due or not (the learner may practice an item early). */
  async card(subject: ReviewSubject): Promise<ReviewCard> {
    const item = await this.find(subject);
    const cue = await this.coach.cue(item, await this.learnerContext.load());
    return { item, cue };
  }

  /** Checks the spoken answer (null: the learner said they don't know) and moves the item's schedule. */
  async answer(subject: ReviewSubject, cue: ReviewCue, utterance: string | null): Promise<ReviewAnswer> {
    const item = await this.find(subject);
    const said = utterance?.trim();
    const recalled = said ? await this.coach.check(item, cue, said) : false;
    const next = await this.scheduler.answered(item.language, subject, recalled ? "recalled" : "missed", this.clock.now());
    return { recalled, answer: cue.answer, rule: item.rule, nextDueAt: next.dueAt };
  }

  private async find(subject: ReviewSubject): Promise<ReviewItem> {
    const item = await this.reviews.item(subject);
    if (!item) throw new ReviewItemNotFoundError(subject);
    return item;
  }
}
