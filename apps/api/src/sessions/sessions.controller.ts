import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { EndSessionBody, SessionTimingSchema, StartSessionBody, TurnBody } from "@voxa/contracts";
import { z } from "zod";
import { SessionEndService } from "../application/session-end.service.js";
import { SessionStartService } from "../application/session-start.service.js";
import { SessionSummaryService } from "../application/session-summary.service.js";
import { TurnService } from "../application/turn.service.js";
import { parse } from "../common/http.js";
import { trackView } from "../domain/conversation/guided-track.js";

const SessionId = z.uuid();

@Controller("sessions")
export class SessionsController {
  constructor(
    private readonly starts: SessionStartService,
    private readonly turns: TurnService,
    private readonly summaries: SessionSummaryService,
    private readonly ending: SessionEndService,
  ) {}

  @Post()
  async start(@Body() body: unknown) {
    const { mode, language, missionId } = parse(StartSessionBody, body);
    const { session, message, goals } = await this.starts.start(mode, language, missionId);
    return {
      sessionId: session.id,
      mode: session.mode,
      language: session.language,
      message,
      goals,
      track: trackView(session.track),
      scaffold: session.scaffold,
    };
  }

  /** An open session, to pick it up again (e.g. after the page reloads). */
  @Get(":id")
  async resume(@Param("id") id: string) {
    const sessionId = parse(SessionId, id);
    return this.starts.resume(sessionId);
  }

  @Post(":id/turns")
  @HttpCode(200)
  async turn(@Param("id") id: string, @Body() body: unknown) {
    const sessionId = parse(SessionId, id);
    const { text } = parse(TurnBody, body);
    return this.turns.respond(sessionId, text);
  }

  /** "I said it right": the pending mistake no longer counts, and the conversation goes on. */
  @Post(":id/pending/withdraw")
  @HttpCode(204)
  async withdrawPending(@Param("id") id: string): Promise<void> {
    await this.turns.withdrawPending(parse(SessionId, id));
  }

  /** The timing so far, sent after each turn, so a session left open keeps it. */
  @Put(":id/timing")
  @HttpCode(204)
  async timing(@Param("id") id: string, @Body() body: unknown): Promise<void> {
    await this.summaries.saveTiming(parse(SessionId, id), parse(SessionTimingSchema, body));
  }

  @Post(":id/end")
  @HttpCode(200)
  async end(@Param("id") id: string, @Body() body: unknown) {
    const { timing } = parse(EndSessionBody, body);
    return this.ending.end(parse(SessionId, id), timing ?? null);
  }
}
