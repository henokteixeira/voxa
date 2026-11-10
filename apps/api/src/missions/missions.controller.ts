import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ExpressionAttemptBody, MissionStepBody } from "@voxa/contracts";
import { z } from "zod";
import { MissionService } from "../application/mission.service.js";
import { Language, parse, TimeZone } from "../common/http.js";
import { MARKED_STEPS } from "../domain/mission/mission.js";

const TodayQuery = z.object({ language: Language, timeZone: TimeZone });
const MissionId = z.uuid();
const Step = z.enum(MARKED_STEPS);

/** The daily mission: today's situation, and step 1's model with its 3 expressions. */
@Controller("missions")
export class MissionsController {
  constructor(private readonly missions: MissionService) {}

  /** The mission of the learner's local day (created on the day's first request). */
  @Get("today")
  today(@Query() query: unknown) {
    const { language, timeZone } = parse(TodayQuery, query);
    return this.missions.today(language, timeZone);
  }

  /** Step 1's model: who speaks, what they say, and the 3 expressions. The first request writes it. */
  @Get(":id/model")
  model(@Param("id") id: string) {
    return this.missions.model(parse(MissionId, id));
  }

  /** Marks step 1 (listened once), step 2 (the 3 expressions tried) or step 5 (the review) done; returns the mission. */
  @Post(":id/steps/:step")
  @HttpCode(200)
  markStep(@Param("id") id: string, @Param("step") step: string, @Body() body: unknown) {
    const { timeZone } = parse(MissionStepBody, body);
    return this.missions.markStep(parse(MissionId, id), parse(Step, step), timeZone);
  }

  /** Step 2: whether the learner's sentence used the expression. */
  @Post(":id/expressions/:expressionId/attempts")
  @HttpCode(200)
  say(@Param("id") id: string, @Param("expressionId") expressionId: string, @Body() body: unknown) {
    const { utterance } = parse(ExpressionAttemptBody, body);
    return this.missions.say(parse(MissionId, id), parse(MissionId, expressionId), utterance);
  }

  /** The model as speech (WAV). */
  @Get(":id/model/speech")
  async speech(@Param("id") id: string, @Res() res: Response) {
    const wav = await this.missions.modelSpeech(parse(MissionId, id));
    res.type("audio/wav").set("cache-control", "private, max-age=86400").send(wav);
  }
}
