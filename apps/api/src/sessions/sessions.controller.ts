import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { z } from "zod";
import { ConversationService } from "../application/conversation.service.js";
import { SessionEndService } from "../application/session-end.service.js";
import { Language, parse } from "../common/http.js";
import { trackView } from "../domain/conversation/guided-track.js";
import { MODES } from "../domain/conversation/mode.js";

const StartBody = z.object({
  mode: z.enum(MODES),
  language: Language,
  /** A daily mission's step 3: the session is that mission's conversation. */
  missionId: z.uuid().optional(),
});
const TurnBody = z.object({ text: z.string().trim().min(1).max(2000) });
const Ms = z.number().int().min(0).max(24 * 60 * 60 * 1000);
/** Speaking time and pauses the web app measured. */
const Timing = z.object({
  learnerSpeechMs: Ms,
  tutorSpeechMs: Ms,
  pausesMs: z.array(Ms).max(5000),
  longPausesMs: z.array(Ms).max(5000).optional(),
  spokenWords: z.number().int().min(0).max(1_000_000).optional(),
});
/** Missing when the session ends without it (e.g. the learner left): the timing saved during the session stays. */
const EndBody = z.object({ timing: Timing.optional() }).default({});
const SessionId = z.uuid();

@Controller("sessions")
export class SessionsController {
  constructor(
    private readonly conversation: ConversationService,
    private readonly ending: SessionEndService,
  ) {}

  @Post()
  async start(@Body() body: unknown) {
    const { mode, language, missionId } = parse(StartBody, body);
    const { session, message, goals } = await this.conversation.start(mode, language, missionId);
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
    return this.conversation.resume(sessionId);
  }

  @Post(":id/turns")
  @HttpCode(200)
  async turn(@Param("id") id: string, @Body() body: unknown) {
    const sessionId = parse(SessionId, id);
    const { text } = parse(TurnBody, body);
    return this.conversation.respond(sessionId, text);
  }

  /** The timing so far, sent after each turn, so a session left open keeps it. */
  @Put(":id/timing")
  @HttpCode(204)
  async timing(@Param("id") id: string, @Body() body: unknown): Promise<void> {
    await this.conversation.saveTiming(parse(SessionId, id), parse(Timing, body));
  }

  @Post(":id/end")
  @HttpCode(200)
  async end(@Param("id") id: string, @Body() body: unknown) {
    const { timing } = parse(EndBody, body);
    return this.ending.end(parse(SessionId, id), timing ?? null);
  }
}
