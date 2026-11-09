import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { MissionService } from "../application/mission.service.js";
import { Language, parse, TimeZone } from "../common/http.js";

const TodayQuery = z.object({ language: Language, timeZone: TimeZone });
const MissionId = z.uuid();

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

  /** The model as speech (WAV). */
  @Get(":id/model/speech")
  async speech(@Param("id") id: string, @Res() res: Response) {
    const wav = await this.missions.modelSpeech(parse(MissionId, id));
    res.type("audio/wav").set("cache-control", "private, max-age=86400").send(wav);
  }
}
