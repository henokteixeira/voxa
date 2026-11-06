import {
  BadGatewayException,
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
import { Language, parse } from "../common/http.js";
import { MODES } from "../domain/conversation/mode.js";
import { TutorUnavailableError } from "../domain/ports/tutor.port.js";

const StartBody = z.object({
  mode: z.enum(MODES),
  language: Language,
});
const TurnBody = z.object({ text: z.string().trim().min(1).max(2000) });
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
  async end(@Param("id") id: string) {
    const sessionId = parse(SessionId, id);
    return handle(() => this.conversation.end(sessionId));
  }
}
