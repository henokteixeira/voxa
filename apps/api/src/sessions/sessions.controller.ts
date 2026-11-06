import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
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
import { MODES } from "../domain/conversation/mode.js";
import { TutorUnavailableError } from "../domain/ports/tutor.port.js";

const StartBody = z.object({
  mode: z.enum(MODES),
  // BCP 47, e.g. "en" or "en-US".
  language: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
    .default("en"),
});
const TurnBody = z.object({ text: z.string().trim().min(1).max(2000) });
const Ms = z.number().int().min(0).max(24 * 60 * 60 * 1000);
/** Timing the web app measured; missing when the session ends without it (e.g. the learner left). */
const EndBody = z
  .object({
    timing: z.object({ learnerSpeechMs: Ms, tutorSpeechMs: Ms, pausesMs: z.array(Ms).max(5000) }).optional(),
  })
  .default({});
const ConfidenceBody = z.object({ moment: z.enum(["before", "after"]), value: z.number().int().min(1).max(5) });
const SessionId = z.uuid();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(z.prettifyError(result.error));
  return result.data;
}

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
  constructor(private readonly conversation: ConversationService) {}

  @Post()
  async start(@Body() body: unknown) {
    const { mode, language } = parse(StartBody, body);
    return handle(async () => {
      const { session, message } = await this.conversation.start(mode, language);
      return { sessionId: session.id, mode: session.mode, language: session.language, message };
    });
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
    return handle(() => this.conversation.end(sessionId, timing ?? null));
  }

  @Post(":id/confidence")
  @HttpCode(204)
  async confidence(@Param("id") id: string, @Body() body: unknown) {
    const sessionId = parse(SessionId, id);
    const { moment, value } = parse(ConfidenceBody, body);
    await handle(() => this.conversation.rateConfidence(sessionId, moment, value));
  }
}
