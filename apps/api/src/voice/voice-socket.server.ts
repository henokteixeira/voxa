import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { type VoiceInput, VoiceConversationService } from "../application/voice-conversation.service.js";
import { DomainError, type ErrorCode, InvalidInputError } from "../domain/errors.js";

/**
 * Live voice session over a WebSocket at /api/sessions/:id/voice. One socket per session.
 *
 * Client → server: a binary frame is one finished turn of speech (WAV, at most 10 MB); a text frame
 * is JSON, `{type:"text", text}` (a typed turn) or `{type:"speak"}` (say the tutor's last line again).
 *
 * Server → client, per request: `{type:"transcript", text}`, `{type:"tutor", kind, message, selfCorrected, support, mistake, checkIn, coveredGoals}`,
 * the speech as a binary WAV frame, then `{type:"done"}`. A failure sends `{type:"error", code, message}`
 * before "done". Any part may be missing (no speech heard → only "done").
 *
 * When the tutor's reply comes before its analysis of the turn: "tutor", the reply's speech, then
 * `{type:"followup", kind, message, selfCorrected, support, mistake, checkIn, coveredGoals}` (message null when
 * nothing is said after the reply), the follow-up's speech when there is one, then "done".
 *
 * Out of band, never followed by "done": `{type:"error", code:"busy"}` answers a message sent while a
 * request is running (the message is dropped). Close codes: 1009 frame too large, 4409 the session
 * already has a live socket.
 */
export type VoiceErrorCode = ErrorCode | "busy" | "server";

export const SESSION_IN_USE_CLOSE_CODE = 4409;

const PATH = /^\/api\/sessions\/([^/]+)\/voice$/;
/** About 5 minutes of 16 kHz 16-bit mono speech (the web app sends 16 kHz). */
const MAX_FRAME_BYTES = 10 * 1024 * 1024;

const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal("speak") }),
]);

/** Sends a JSON message, or a binary frame for speech. */
type Send = (message: Record<string, unknown> | Buffer) => void;

class NotWavError extends DomainError {
  readonly code = "bad_audio";

  constructor() {
    super("The audio frame is not a WAV file.", "Voxa couldn't use that recording.");
  }
}

const BUSY_MESSAGE = "Still answering your last turn.";
const SERVER_MESSAGE = "Something went wrong.";

@Injectable()
export class VoiceSocketServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(VoiceSocketServer.name);
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  /** Sessions with a live socket: two sockets on one session would interleave turns. */
  private readonly live = new Set<string>();
  private server?: Server;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly voice: VoiceConversationService,
  ) {}

  onApplicationBootstrap() {
    this.server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    this.server.on("upgrade", this.upgrade);
  }

  onApplicationShutdown() {
    this.server?.off("upgrade", this.upgrade);
    for (const client of this.wss.clients) client.terminate();
    this.wss.close();
  }

  private readonly upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    const sessionId = z.uuid().safeParse(PATH.exec(pathname)?.[1]);
    if (!sessionId.success) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.serve(ws, sessionId.data));
  };

  private serve(ws: WebSocket, sessionId: string) {
    if (this.live.has(sessionId)) {
      ws.on("error", () => {});
      ws.close(SESSION_IN_USE_CLOSE_CODE, "This session is open somewhere else.");
      return;
    }
    this.live.add(sessionId);
    let busy = false;
    let closed = false;
    const send: Send = (message) => {
      if (ws.readyState === ws.OPEN) ws.send(Buffer.isBuffer(message) ? message : JSON.stringify(message));
    };
    const fail = (code: VoiceErrorCode, message: string) => send({ type: "error", code, message });

    const leave = () => {
      if (closed) return;
      closed = true;
      this.live.delete(sessionId);
    };
    // Oversized or malformed frames: ws closes the socket (1009/1002); without a listener Node would crash.
    ws.on("error", (error) => {
      this.logger.warn(`Voice socket error: ${error.message}`);
      leave();
    });
    ws.on("close", leave);
    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (busy) return fail("busy", BUSY_MESSAGE);
      busy = true;
      void this.handle(sessionId, toBuffer(data), isBinary, send, () => closed)
        .catch((error: unknown) => {
          if (error instanceof DomainError) {
            if (error.code === "tutor_unavailable" || error.code === "voice_unavailable") {
              this.logger.warn(`Voice turn on session ${sessionId}: ${error.name}: ${error.message}`);
            }
            return fail(error.code, error.publicMessage);
          }
          this.logger.error(`Voice turn on session ${sessionId} failed`, (error as Error)?.stack ?? String(error));
          fail("server", SERVER_MESSAGE);
        })
        .finally(() => {
          busy = false;
          send({ type: "done" });
        });
    });
  }

  private async handle(sessionId: string, data: Buffer, isBinary: boolean, send: Send, cancelled: () => boolean) {
    let input: VoiceInput | null;
    if (isBinary) {
      if (!isWav(data)) throw new NotWavError();
      input = { audio: data, mimeType: "audio/wav" };
    } else {
      const message = parseMessage(data);
      input = message.type === "text" ? { text: message.text } : null;
    }
    const speech = input
      ? await this.voice.turn(sessionId, input, {
          transcript: (text) => send({ type: "transcript", text }),
          tutor: (result) => send({ ...result, type: "tutor" }),
          speech: (wav) => send(wav),
          followUp: (result) => send({ ...result, message: result.message || null, type: "followup" }),
          cancelled,
          timing: ({ sttMs, tutorMs, ttsMs, totalMs }) =>
            this.logger.log(`turn timing stt=${sttMs ?? "-"}ms tutor=${tutorMs}ms tts=${ttsMs}ms total=${totalMs}ms`),
        })
      : await this.voice.speakLast(sessionId);
    if (speech) send(speech);
  }
}

function isWav(data: Buffer): boolean {
  return data.length > 44 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WAVE";
}

function parseMessage(data: Buffer) {
  let json: unknown;
  try {
    json = JSON.parse(data.toString("utf8"));
  } catch {
    throw new InvalidInputError("The message is not JSON.");
  }
  const parsed = ClientMessage.safeParse(json);
  if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
  return parsed.data;
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}
