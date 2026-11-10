import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { ReviewService } from "../application/review.service.js";
import { Language, parse } from "../common/http.js";
import { ReviewAnswerBody, ReviewCardBody } from "@voxa/contracts";

const OverviewQuery = z.object({ language: Language });

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
    const { subject } = parse(ReviewCardBody, body);
    return this.reviews.card(subject);
  }

  /** Checks the answer to a card and moves the item's schedule; answering the same card again repeats the result. */
  @Post("answers")
  @HttpCode(200)
  async answer(@Body() body: unknown) {
    const { cardId, utterance, timeZone, startDelayMs } = parse(ReviewAnswerBody, body);
    return this.reviews.answer(cardId, utterance, timeZone, startDelayMs ?? null);
  }
}
