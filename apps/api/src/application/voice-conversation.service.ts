import { Inject, Injectable } from "@nestjs/common";
import type { Session } from "../domain/conversation/types.js";
import { SESSION_REPOSITORY, type SessionRepository } from "../domain/ports/session.repository.js";
import { STT_PORT, type SpeechToTextPort, TTS_PORT, type TextToSpeechPort } from "../domain/ports/voice.port.js";
import { ConversationService, SessionEndedError, SessionNotFoundError, type TurnResult } from "./conversation.service.js";

/** One learner turn: recorded speech, or typed text (for "Type instead" and retries). */
export type VoiceInput = { audio: Buffer; mimeType: string } | { text: string };

/** Partial results, sent as soon as they exist so captions do not wait for the voice. */
export interface VoiceTurnEvents {
  transcript(text: string): void;
  tutor(result: TurnResult): void;
  /** True once the learner has left; the service then skips work nobody will hear. */
  cancelled(): boolean;
}

/** The voice loop: speech-to-text → tutor → text-to-speech, on top of the text conversation. */
@Injectable()
export class VoiceConversationService {
  constructor(
    private readonly conversation: ConversationService,
    @Inject(SESSION_REPOSITORY) private readonly sessions: Pick<SessionRepository, "get" | "history">,
    @Inject(STT_PORT) private readonly stt: SpeechToTextPort,
    @Inject(TTS_PORT) private readonly tts: TextToSpeechPort,
  ) {}

  /** Returns the tutor's spoken answer (WAV), or null when the audio held no speech. */
  async turn(sessionId: string, input: VoiceInput, events: VoiceTurnEvents): Promise<Buffer | null> {
    const session = await this.session(sessionId);
    if (session.endedAt) throw new SessionEndedError(sessionId);

    const said =
      "text" in input
        ? input.text
        : (await this.stt.transcribe(input.audio, session.language, { mimeType: input.mimeType })).text;
    const text = said.trim();
    if (!text) return null;
    events.transcript(text);
    if (events.cancelled()) return null;

    const result = await this.conversation.respond(sessionId, text);
    events.tutor(result);
    if (events.cancelled()) return null;
    return this.tts.synthesize(result.message, session.language);
  }

  /** Speaks the tutor's last line again (the session's opening line, or "repeat the last question"). */
  async speakLast(sessionId: string): Promise<Buffer | null> {
    const session = await this.session(sessionId);
    if (session.endedAt) throw new SessionEndedError(sessionId);
    const history = await this.sessions.history(sessionId);
    const last = history.findLast((turn) => turn.role === "assistant");
    return last ? this.tts.synthesize(last.content, session.language) : null;
  }

  private async session(sessionId: string): Promise<Session> {
    const session = await this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    return session;
  }
}
