import type { FollowUp, TurnResult } from "../api";

/** Mirrors the API's voice protocol (apps/api/src/voice/voice-socket.server.ts). */
export type VoiceErrorCode =
  | "not_found"
  | "ended"
  | "tutor_unavailable"
  | "voice_unavailable"
  | "bad_audio"
  | "invalid"
  | "busy"
  | "server"
  /** The session is already open in another tab (close code 4409). */
  | "in_use"
  /** The turn was too long to send (close code 1009); the socket is closed and needs a reconnect. */
  | "too_long"
  /** The socket closed or never opened. */
  | "disconnected";

export interface VoiceSocketHandlers {
  onOpen(): void;
  onTranscript(text: string): void;
  onTutor(result: TurnResult): void;
  /** After the reply: a hint, the stop-or-keep-going question, or only help and goals. Its speech follows. */
  onFollowUp(result: FollowUp): void;
  /** The tutor's speech, as WAV. */
  onSpeech(wav: ArrayBuffer): void;
  onError(code: VoiceErrorCode, message: string): void;
  /** The current request is finished (after its speech, or its error). */
  onDone(): void;
}

type ServerMessage =
  | { type: "transcript"; text: string }
  | ({ type: "tutor" } & TurnResult)
  | ({ type: "followup" } & FollowUp)
  | { type: "error"; code: VoiceErrorCode; message: string }
  | { type: "done" };

export interface VoiceSocket {
  /** One finished turn of speech (WAV). */
  sendTurn(wav: ArrayBuffer): void;
  /** A typed turn, or a retry of the last transcript. */
  sendText(text: string): void;
  /** Asks for the tutor's last line again, spoken. */
  speakLast(): void;
  close(): void;
}

type SocketFactory = (url: string) => WebSocket;

export function openVoiceSocket(
  url: string,
  handlers: VoiceSocketHandlers,
  create: SocketFactory = (u) => new WebSocket(u),
): VoiceSocket {
  const ws = create(url);
  ws.binaryType = "arraybuffer";
  let closedByUs = false;

  ws.onopen = () => handlers.onOpen();
  ws.onmessage = (event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) return handlers.onSpeech(event.data);
    let message: ServerMessage;
    try {
      message = JSON.parse(String(event.data)) as ServerMessage;
    } catch {
      return;
    }
    if (message.type === "transcript") handlers.onTranscript(message.text);
    else if (message.type === "tutor") handlers.onTutor({ ...turnFields(message), message: message.message });
    else if (message.type === "followup") handlers.onFollowUp({ ...turnFields(message), message: message.message });
    else if (message.type === "error") handlers.onError(message.code, message.message);
    else if (message.type === "done") handlers.onDone();
  };
  ws.onclose = (event: CloseEvent) => {
    if (closedByUs) return;
    if (event.code === 4409) handlers.onError("in_use", "This session is open in another tab.");
    else if (event.code === 1009) handlers.onError("too_long", "That turn was too long to send.");
    else handlers.onError("disconnected", "Lost the connection to Voxa.");
  };

  const send = (data: string | ArrayBuffer) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
    else handlers.onError("disconnected", "Lost the connection to Voxa.");
  };

  return {
    sendTurn: (wav) => send(wav),
    sendText: (text) => send(JSON.stringify({ type: "text", text })),
    speakLast: () => send(JSON.stringify({ type: "speak" })),
    close: () => {
      closedByUs = true;
      ws.close();
    },
  };
}

/** The fields of a tutor line the app uses; empty help and missing optional fields are left out. */
function turnFields({ kind, selfCorrected, support, checkIn, coveredGoals }: Omit<TurnResult, "message">) {
  return {
    kind,
    selfCorrected,
    ...(support ? { support } : {}),
    ...(checkIn !== undefined ? { checkIn } : {}),
    ...(coveredGoals !== undefined ? { coveredGoals } : {}),
  };
}
