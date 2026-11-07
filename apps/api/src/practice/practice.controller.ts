import { Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";
import { PracticeService } from "../application/practice.service.js";
import { Language, parse } from "../common/http.js";

const PracticeQuery = z.object({ language: Language });

@Controller("practice")
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  /** The bank grouped by pattern, the new words, and when each comes back for review. */
  @Get()
  async view(@Query() query: unknown) {
    const { language } = parse(PracticeQuery, query);
    return this.practice.view(language);
  }
}
