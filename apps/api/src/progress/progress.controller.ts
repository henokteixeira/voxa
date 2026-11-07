import { Body, Controller, Get, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { ProgressService } from "../application/progress.service.js";
import { Language, parse } from "../common/http.js";
import { DAILY_MINUTES, isTimeZone } from "../domain/progress/daily-goal.js";

/** An IANA time zone (e.g. "America/Sao_Paulo"): days, the goal and the streak follow the learner's clock. */
const TimeZone = z.string().max(64).refine(isTimeZone, "Unknown time zone.");
const TodayQuery = z.object({ language: Language, timeZone: TimeZone });
const DailyGoalBody = z.object({
  language: Language,
  timeZone: TimeZone,
  minutesPerDay: z.union(DAILY_MINUTES.map((minutes) => z.literal(minutes))),
});

@Controller("progress")
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

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
}
