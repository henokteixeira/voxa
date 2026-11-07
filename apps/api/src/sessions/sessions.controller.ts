import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { ConversationService } from "../application/conversation.service.js";
import { Language, parse } from "../common/http.js";
import { MODES } from "../domain/conversation/mode.js";

const StartBody = z.object({
  mode: z.enum(MODES),
  language: Language,
});
const TurnBody = z.object({ text: z.string().trim().min(1).max(2000) });
const Ms = z.number().int().min(0).max(24 * 60 * 60 * 1000);
/** Timing the web app measured; missing when the session ends without it (e.g. the learner left). */
const EndBody = z
  .object({
    timing: z
      .object({
        learnerSpeechMs: Ms,
        tutorSpeechMs: Ms,
        pausesMs: z.array(Ms).max(5000),
        longPausesMs: z.array(Ms).max(5000).optional(),
        spokenWords: z.number().int().min(0).max(1_000_000).optional(),
      })
      .optional(),
  })
  .default({});
const ConfidenceBody = z.object({ moment: z.enum(["before", "after"]), value: z.number().int().min(1).max(5) });
const SessionId = z.uuid();

@Controller("sessions")
export class SessionsController {
  constructor(private readonly conversation: ConversationService) {}

  @Post()
  async start(@Body() body: unknown) {
    const { mode, language } = parse(StartBody, body);
    const { session, message, goals } = await this.conversation.start(mode, language);
    return { sessionId: session.id, mode: session.mode, language: session.language, message, goals };
  }

  /** An open session, to pick it up again (e.g. after the page reloads). */
  @Get(":id")
  async resume(@Param("id") id: string) {
    const sessionId = parse(SessionId, id);
    return this.conversation.resume(sessionId);
  }

  @Post(":id/turns")
  @HttpCode(200)
  async turn(@Param("id") id: string, @Body() body: unknown) {
    const sessionId = parse(SessionId, id);
    const { text } = parse(TurnBody, body);
    return this.conversation.respond(sessionId, text);
  }

  @Post(":id/end")
  @HttpCode(200)
  async end(@Param("id") id: string, @Body() body: unknown) {
    const sessionId = parse(SessionId, id);
    const { timing } = parse(EndBody, body);
    return this.conversation.end(sessionId, timing ?? null);
  }

  @Post(":id/confidence")
  @HttpCode(204)
  async confidence(@Param("id") id: string, @Body() body: unknown) {
    const sessionId = parse(SessionId, id);
    const { moment, value } = parse(ConfidenceBody, body);
    await this.conversation.rateConfidence(sessionId, moment, value);
  }
}
