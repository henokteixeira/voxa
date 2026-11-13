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
  type StoredReviewCard,
} from "../domain/ports/review.repository.js";
import { cardsEarningXp, XP_PER_REVIEW } from "../domain/progress/daily-goal.js";
import { recallOutcome } from "../domain/review/review-schedule.js";
import { ReviewScheduler } from "./review-scheduler.js";

/** How far back to look for an item's earlier answers the same day; also covers a retried answer. */
const XP_LOOKBACK_MS = 2 * 86_400_000;

/** How many items one review asks for: short enough for about three minutes by voice. */
export const REVIEW_SIZE = 5;

export class ReviewCardNotFoundError extends DomainError {
  readonly code = "not_found";

  constructor(cardId: string) {
    super(`Review card ${cardId} not found.`, "That review question is no longer available.");
  }
}

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

/** One question of a review: the item, and a new cue for it. The answer is sent back with the card's id. */
export interface ReviewCard {
  cardId: string;
  item: ReviewItem;
  /** The sentence to say, in the learner's first language. The answer stays on the server until the learner tries. */
  cue: string;
}

export interface ReviewAnswer {
  recalled: boolean;
  /** One way to say the cue, shown after the answer. */
  answer: string;
  rule: string;
  /** Another mistake in the answer, in one line in the learner's first language; null when none. */
  otherMistake: string | null;
  /** When the item comes back. */
  nextDueAt: Date;
  /**
   * XP the answer earned: only an item's first answer of the learner's day earns it. A retried answer reports the same
   * XP without adding more.
   */
  xp: number;
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
    const cue: ReviewCue = await this.coach.cue(item, await this.learnerContext.load());
    const card = await this.reviews.addCard(subject, cue);
    return { cardId: card.id, item, cue: card.cue };
  }

  /**
   * Checks the spoken answer to a card (null: the learner said they don't know) and moves the item's schedule.
   * `startDelayMs`: from the cue showing to the learner starting to speak; a right answer after a long search is slow.
   * A card is answered once: sending the same answer again (a retried request) returns the first result.
   */
  async answer(cardId: string, utterance: string | null, timeZone: string, startDelayMs: number | null = null): Promise<ReviewAnswer> {
    const card = await this.reviews.card(cardId);
    if (!card) throw new ReviewCardNotFoundError(cardId);
    const item = await this.find(card.subject);
    if (card.recalled !== null) return this.result(card.recalled, card, item, timeZone);

    const said = utterance?.trim();
    const { recalled, otherMistake } = said ? await this.coach.check(item, card, said) : { recalled: false, otherMistake: null };
    const now = this.clock.now();
    if (!(await this.reviews.answerCard(card.id, recalled, now))) {
      const first = await this.reviews.card(card.id);
      return this.result(first?.recalled ?? recalled, card, await this.find(card.subject), timeZone);
    }
    const next = await this.scheduler.answered(item.language, card.subject, recallOutcome(recalled, startDelayMs), now);
    const xp = await this.xpFor(card.id, item.language, timeZone);
    return { recalled, answer: card.answer, rule: item.rule, otherMistake, nextDueAt: next.dueAt, xp };
  }

  private async result(recalled: boolean, card: StoredReviewCard, item: ReviewItem, timeZone: string): Promise<ReviewAnswer> {
    // An answer sent again gets the first result back; the other mistake was shown then.
    const xp = await this.xpFor(card.id, item.language, timeZone);
    return { recalled, answer: card.answer, rule: item.rule, otherMistake: null, nextDueAt: item.dueAt, xp };
  }

  /** Whether the card was its item's first answer of the learner's day (a local day spans at most 26 hours). */
  private async xpFor(cardId: string, language: string, timeZone: string): Promise<number> {
    const since = new Date(this.clock.now().getTime() - XP_LOOKBACK_MS);
    const earning = cardsEarningXp(await this.reviews.answeredSince(language, since), timeZone);
    return earning.some((c) => c.cardId === cardId) ? XP_PER_REVIEW : 0;
  }

  private async find(subject: ReviewSubject): Promise<ReviewItem> {
    const item = await this.reviews.item(subject);
    if (!item) throw new ReviewItemNotFoundError(subject);
    return item;
  }
}
