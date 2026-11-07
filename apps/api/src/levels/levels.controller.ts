import { Body, Controller, Get, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { LevelService } from "../application/level.service.js";
import { Language, parse } from "../common/http.js";
import { CEFR_LEVELS } from "../domain/level/speaking-level.js";

const LevelQuery = z.object({ language: Language });
const SetLevelBody = z.object({ language: Language, level: z.enum(CEFR_LEVELS) });

@Controller("level")
export class LevelsController {
  constructor(private readonly levels: LevelService) {}

  @Get()
  async view(@Query() query: unknown) {
    const { language } = parse(LevelQuery, query);
    return this.levels.view(language);
  }

  /** The learner corrects the estimated level by hand. */
  @Put()
  async set(@Body() body: unknown) {
    const { language, level } = parse(SetLevelBody, body);
    return this.levels.setByHand(language, level);
  }
}
