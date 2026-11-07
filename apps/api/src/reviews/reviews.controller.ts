import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { ReviewService } from "../application/review.service.js";
import { Language, parse } from "../common/http.js";

const OverviewQuery = z.object({ language: Language });
const Subject = z.object({ kind: z.enum(["pattern", "new_word"]), id: z.uuid() });
const CardBody = z.object({ subject: Subject });
const AnswerBody = z.object({
  subject: Subject,
  cue: z.object({ cue: z.string().trim().min(1).max(500), answer: z.string().trim().min(1).max(500) }),
  /** What the learner said; null when they chose "I don't know". */
  utterance: z.string().max(2000).nullable(),
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

  /** Checks an answer and moves the item's schedule. */
  @Post("answers")
  @HttpCode(200)
  async answer(@Body() body: unknown) {
    const { subject, cue, utterance } = parse(AnswerBody, body);
    return this.reviews.answer(subject, cue, utterance);
  }
}
