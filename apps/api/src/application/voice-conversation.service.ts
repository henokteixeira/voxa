import { Inject, Injectable } from "@nestjs/common";
import type { Session } from "../domain/conversation/types.js";
import { METRICS_RECORDER, type MetricsRecorder } from "../domain/ports/metrics.port.js";
import { SESSION_REPOSITORY, type SessionRepository } from "../domain/ports/session.repository.js";
import { STT_PORT, type SpeechToTextPort, TTS_PORT, type TextToSpeechPort } from "../domain/ports/voice.port.js";
import { ConversationService, SessionEndedError, SessionNotFoundError, type TurnResult } from "./conversation.service.js";

/** One learner turn: recorded speech, or typed text (for "Type instead" and retries). */
export type VoiceInput = { audio: Buffer; mimeType: string } | { text: string };

/** How long each stage of one turn took, from the end of the learner's speech to the tutor's voice. */
export interface TurnTiming {
  /** Null for a typed turn. */
  sttMs: number | null;
  tutorMs: number;
  ttsMs: number;
  totalMs: number;
}

/** Partial results, sent as soon as they exist so captions do not wait for the voice. */
export interface VoiceTurnEvents {
  transcript(text: string): void;
  /** The tutor's reply; when its analysis is still running, `speech` and `followUp` come after it. */
  tutor(result: TurnResult): void;
  /** The reply's speech (WAV), sent as soon as it is ready, before the follow-up. */
  speech(wav: Buffer): void;
  /** What follows a reply said early: a hint, the stop-or-keep-going question, or "" (only help and goals). */
  followUp(result: TurnResult): void;
  /** True once the learner has left; the service then skips work nobody will hear. */
  cancelled(): boolean;
  /** Sent once the tutor's voice is ready, to measure the loop. */
  timing?(timing: TurnTiming): void;
}

/** The voice loop: speech-to-text → tutor → text-to-speech, on top of the text conversation. */
@Injectable()
export class VoiceConversationService {
  constructor(
    private readonly conversation: ConversationService,
    @Inject(SESSION_REPOSITORY) private readonly sessions: Pick<SessionRepository, "get" | "history">,
    @Inject(STT_PORT) private readonly stt: SpeechToTextPort,
    @Inject(TTS_PORT) private readonly tts: TextToSpeechPort,
    @Inject(METRICS_RECORDER) private readonly metrics: Pick<MetricsRecorder, "voiceTurn">,
  ) {}

  /** Returns the tutor's spoken answer (WAV), or null when the audio held no speech. */
  async turn(sessionId: string, input: VoiceInput, events: VoiceTurnEvents): Promise<Buffer | null> {
    const session = await this.session(sessionId);
    if (session.endedAt) throw new SessionEndedError(sessionId);

    const started = performance.now();
    const said =
      "text" in input
        ? input.text
        : (await this.stt.transcribe(input.audio, session.language, { mimeType: input.mimeType })).text;
    const heard = performance.now();
    const text = said.trim();
    if (!text) return null;
    events.transcript(text);
    if (events.cancelled()) return null;

    const report = (answered: number, spoken: number) => {
      const timing: TurnTiming = {
        sttMs: "text" in input ? null : Math.round(heard - started),
        tutorMs: Math.round(answered - heard),
        ttsMs: Math.round(spoken - answered),
        totalMs: Math.round(spoken - started),
      };
      events.timing?.(timing);
      // Kept to decide on speed with data; never delays the turn.
      void this.metrics.voiceTurn({ sessionId, ...timing });
    };

    // The reply is spoken while the tutor still analyses the turn.
    const reply: { spoken: Promise<void> | null } = { spoken: null };
    const speakReply = (line: TurnResult) => {
      const answered = performance.now();
      events.tutor(line);
      if (events.cancelled()) return;
      reply.spoken = this.tts.synthesize(line.message, session.language).then((wav) => {
        if (events.cancelled()) return;
        report(answered, performance.now());
        events.speech(wav);
      });
      // Awaited below; this only keeps a failure from going unhandled while the analysis runs.
      reply.spoken.catch(() => {});
    };

    let result: TurnResult;
    try {
      result = await this.conversation.respond(sessionId, text, speakReply);
    } catch (error) {
      // The reply's speech must not arrive after the failure is reported.
      await reply.spoken?.catch(() => {});
      throw error;
    }
    if (reply.spoken) {
      const followUp = result.message ? this.tts.synthesize(result.message, session.language) : null;
      followUp?.catch(() => {});
      await reply.spoken;
      if (events.cancelled()) return null;
      events.followUp(result);
      return followUp;
    }

    const answered = performance.now();
    events.tutor(result);
    if (events.cancelled()) return null;
    const speech = await this.tts.synthesize(result.message, session.language);
    report(answered, performance.now());
    return speech;
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
