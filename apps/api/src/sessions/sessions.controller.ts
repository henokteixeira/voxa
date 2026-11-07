import {
  BadGatewayException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { z } from "zod";
import {
  ConversationService,
  SessionEndedError,
  SessionNotFoundError,
} from "../application/conversation.service.js";
import { ProgressService } from "../application/progress.service.js";
import { Language, parse } from "../common/http.js";
import { MODES } from "../domain/conversation/mode.js";
import { TutorUnavailableError } from "../domain/ports/tutor.port.js";

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

/** Maps domain errors to HTTP. */
async function handle<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof SessionNotFoundError) throw new NotFoundException("Session not found.");
    if (error instanceof SessionEndedError) throw new ConflictException("This session has ended.");
    if (error instanceof TutorUnavailableError) throw new BadGatewayException("The tutor is not available right now.");
    throw error;
  }
}

@Controller("sessions")
export class SessionsController {
  constructor(
    private readonly conversation: ConversationService,
    private readonly progress: ProgressService,
  ) {}

  @Post()
  async start(@Body() body: unknown) {
    const { mode, language } = parse(StartBody, body);
    return handle(async () => {
      const { session, message, goals } = await this.conversation.start(mode, language);
      return { sessionId: session.id, mode: session.mode, language: session.language, message, goals };
    });
  }

  /** An open session, to pick it up again (e.g. after the page reloads). */
  @Get(":id")
  async resume(@Param("id") id: string) {
    const sessionId = parse(SessionId, id);
    return handle(() => this.conversation.resume(sessionId));
  }

  @Post(":id/turns")
  @HttpCode(200)
  async turn(@Param("id") id: string, @Body() body: unknown) {
    const sessionId = parse(SessionId, id);
    const { text } = parse(TurnBody, body);
    return handle(() => this.conversation.respond(sessionId, text));
  }

  @Post(":id/end")
  @HttpCode(200)
  async end(@Param("id") id: string, @Body() body: unknown) {
    const sessionId = parse(SessionId, id);
    const { timing } = parse(EndBody, body);
    return handle(async () => {
      const summary = await this.conversation.end(sessionId, timing ?? null);
      const xp = await this.progress.awardSession({
        sessionId,
        goalsCovered: summary.goals.filter((goal) => goal.covered).length,
        selfCorrections: summary.selfCorrections,
        wordsPerMinute: summary.signals.wordsPerMinute,
      });
      return { ...summary, xp };
    });
  }

  @Post(":id/confidence")
  @HttpCode(204)
  async confidence(@Param("id") id: string, @Body() body: unknown) {
    const sessionId = parse(SessionId, id);
    const { moment, value } = parse(ConfidenceBody, body);
    await handle(() => this.conversation.rateConfidence(sessionId, moment, value));
  }
}
