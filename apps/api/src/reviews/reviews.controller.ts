import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { ReviewService } from "../application/review.service.js";
import { Language, parse, TimeZone } from "../common/http.js";
import { REVIEW_SUBJECT_KINDS } from "../domain/ports/review.repository.js";

const OverviewQuery = z.object({ language: Language });
const Subject = z.object({ kind: z.enum(REVIEW_SUBJECT_KINDS), id: z.uuid() });
const CardBody = z.object({ subject: Subject });
const AnswerBody = z.object({
  cardId: z.uuid(),
  /** What the learner said; null when they chose "I don't know". */
  utterance: z.string().max(2000).nullable(),
  /** The learner's time zone: an item earns XP once per local day. */
  timeZone: TimeZone,
});

@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviews: ReviewService) {}

  /** What is due for review now, and when the next item comes back. */
  @Get()
  async overview(@Query() query: unknown) {
    const { language } = parse(OverviewQuery, query);
    return this.reviews.overview(language);
  }

  /** A new cue for one item. */
  @Post("cards")
  @HttpCode(200)
  async card(@Body() body: unknown) {
    const { subject } = parse(CardBody, body);
    return this.reviews.card(subject);
  }

  /** Checks the answer to a card and moves the item's schedule; answering the same card again repeats the result. */
  @Post("answers")
  @HttpCode(200)
  async answer(@Body() body: unknown) {
    const { cardId, utterance, timeZone } = parse(AnswerBody, body);
    return this.reviews.answer(cardId, utterance, timeZone);
  }
}
