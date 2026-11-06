import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { SessionEndedError, SessionNotFoundError } from "../application/conversation.service.js";
import { type VoiceInput, VoiceConversationService } from "../application/voice-conversation.service.js";
import { TutorUnavailableError } from "../domain/ports/tutor.port.js";
import { VoiceRequestError, VoiceUnavailableError } from "../domain/ports/voice.port.js";

/**
 * Live voice session over a WebSocket at /api/sessions/:id/voice.
 *
 * Client → server: a binary frame is one finished turn of speech (WAV); a text frame is JSON,
 * `{type:"text", text}` (a typed turn) or `{type:"speak"}` (say the tutor's last line again).
 * Server → client, per request: `{type:"transcript"}`, `{type:"tutor"}`, the speech as a binary WAV
 * frame, then `{type:"done"}`. Failures send `{type:"error", code, message}` before "done".
 * One request at a time: a second one while busy gets a "busy" error and is dropped.
 */
export type VoiceErrorCode =
  | "not_found"
  | "ended"
  | "tutor_unavailable"
  | "voice_unavailable"
  | "bad_audio"
  | "invalid"
  | "busy"
  | "server";

const PATH = /\/sessions\/([^/]+)\/voice$/;
/** About 5 minutes of 16 kHz 16-bit mono speech. */
const MAX_FRAME_BYTES = 10 * 1024 * 1024;

const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal("speak") }),
]);

/** Sends a JSON message, or a binary frame for speech. */
type Send = (message: Record<string, unknown> | Buffer) => void;

class InvalidMessageError extends Error {}

function codeFor(error: unknown): VoiceErrorCode {
  if (error instanceof InvalidMessageError) return "invalid";
  if (error instanceof SessionNotFoundError) return "not_found";
  if (error instanceof SessionEndedError) return "ended";
  if (error instanceof TutorUnavailableError) return "tutor_unavailable";
  if (error instanceof VoiceUnavailableError) return "voice_unavailable";
  if (error instanceof VoiceRequestError) return "bad_audio";
  return "server";
}

const MESSAGES: Record<VoiceErrorCode, string> = {
  not_found: "Session not found.",
  ended: "This session has ended.",
  tutor_unavailable: "The tutor didn't answer.",
  voice_unavailable: "The voice server isn't running.",
  bad_audio: "Voxa couldn't use that recording.",
  invalid: "Voxa didn't understand that message.",
  busy: "Still answering your last turn.",
  server: "Something went wrong.",
};

@Injectable()
export class VoiceSocketServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(VoiceSocketServer.name);
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
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
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.serve(ws, sessionId.data));
  };

  private serve(ws: WebSocket, sessionId: string) {
    let busy = false;
    const send: Send = (message) => ws.send(Buffer.isBuffer(message) ? message : JSON.stringify(message));
    const fail = (code: VoiceErrorCode) => send({ type: "error", code, message: MESSAGES[code] });

    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (busy) return fail("busy");
      busy = true;
      void this.handle(sessionId, toBuffer(data), isBinary, send)
        .catch((error: unknown) => {
          const code = codeFor(error);
          if (code === "server") this.logger.error(error);
          fail(code);
        })
        .finally(() => {
          busy = false;
          if (ws.readyState === ws.OPEN) send({ type: "done" });
        });
    });
  }

  private async handle(
    sessionId: string,
    data: Buffer,
    isBinary: boolean,
    send: Send,
  ) {
    let speech: Buffer | null;
    if (isBinary) {
      speech = await this.turn(sessionId, { audio: data, mimeType: "audio/wav" }, send);
    } else {
      const message = parseMessage(data);
      speech =
        message.type === "speak"
          ? await this.voice.speakLast(sessionId)
          : await this.turn(sessionId, { text: message.text }, send);
    }
    if (speech) send(speech);
  }

  private turn(sessionId: string, input: VoiceInput, send: Send) {
    return this.voice.turn(sessionId, input, {
      transcript: (text) => send({ type: "transcript", text }),
      tutor: (result) => send({ type: "tutor", ...result }),
    });
  }

}

function parseMessage(data: Buffer) {
  let json: unknown;
  try {
    json = JSON.parse(data.toString("utf8"));
  } catch {
    throw new InvalidMessageError("not JSON");
  }
  const parsed = ClientMessage.safeParse(json);
  if (!parsed.success) throw new InvalidMessageError(z.prettifyError(parsed.error));
  return parsed.data;
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}
