import { Body, Controller, Get, Put, Query } from "@nestjs/common";
import { DailyGoalBody } from "@voxa/contracts";
import { z } from "zod";
import { ProgressService } from "../application/progress.service.js";
import { SignalsService } from "../application/signals.service.js";
import { Language, parse, TimeZone } from "../common/http.js";
const TodayQuery = z.object({ language: Language, timeZone: TimeZone });
const SignalsQuery = z.object({ language: Language });

@Controller("progress")
export class ProgressController {
  constructor(
    private readonly progress: ProgressService,
    private readonly signals: SignalsService,
  ) {}

  /** Today's XP, goal and streak. */
  @Get("today")
  async today(@Query() query: unknown) {
    const { language, timeZone } = parse(TodayQuery, query);
    return this.progress.today(language, timeZone);
  }

  /** How long the learner wants to practice a day; sets the XP goal from now on. */
  @Put("daily-goal")
  async setDailyGoal(@Body() body: unknown) {
    const { language, timeZone, minutesPerDay } = parse(DailyGoalBody, body);
    return this.progress.setDailyMinutes(language, minutesPerDay, timeZone);
  }

  /** The fluency signals of the last practice sessions, oldest first. */
  @Get("signals")
  async signalsHistory(@Query() query: unknown) {
    const { language } = parse(SignalsQuery, query);
    return { sessions: await this.signals.history(language) };
  }
}
