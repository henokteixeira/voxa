import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { FasterRoundsService } from "../application/faster-rounds.service.js";
import { parse } from "../common/http.js";
import { FASTER_ROUNDS } from "../domain/faster/faster-rounds.js";

const SessionId = z.uuid();
const Ms = z.number().int().min(0).max(10 * 60 * 1000);
const RoundBody = z
  .object({
    round: z.number().int().min(1).max(FASTER_ROUNDS),
    transcript: z.string().trim().max(10_000),
    speechMs: Ms,
    longPausesMs: z.array(Ms).max(1000),
  })
  .refine((r) => r.longPausesMs.reduce((sum, ms) => sum + ms, 0) <= r.speechMs, {
    message: "The long pauses add up to more than the speech.",
    path: ["longPausesMs"],
  });

/** "Say it faster": the same content told 3 times with less time, after a session ends. */
@Controller("sessions/:id/faster-rounds")
export class FasterRoundsController {
  constructor(private readonly faster: FasterRoundsService) {}

  @Get()
  async view(@Param("id") id: string) {
    return this.faster.view(parse(SessionId, id));
  }

  @Post()
  @HttpCode(200)
  async record(@Param("id") id: string, @Body() body: unknown) {
    return this.faster.record(parse(SessionId, id), parse(RoundBody, body));
  }
}
