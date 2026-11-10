import { Body, Controller, Get, HttpCode, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { LevelService } from "../application/level.service.js";
import { Language, parse } from "../common/http.js";
import { SetLevelBody, StepChangeBody } from "@voxa/contracts";

const LevelQuery = z.object({ language: Language });

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

  /** The learner confirms the proposed step change. */
  @Post("step-change")
  @HttpCode(200)
  async confirmStepChange(@Body() body: unknown) {
    const { language, to } = parse(StepChangeBody, body);
    return this.levels.confirmStepChange(language, to);
  }
}
