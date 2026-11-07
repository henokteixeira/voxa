import { Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";
import { ReviewService } from "../application/review.service.js";
import { Language, parse } from "../common/http.js";

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
}
