import { beforeEach, describe, expect, it, vi } from "vitest";
import { openVoiceSocket, type VoiceSocketHandlers } from "./voice-socket";

class FakeSocket {
  static instance: FakeSocket;
  readyState = 0;
  binaryType = "blob";
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.instance = this;
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" || data instanceof ArrayBuffer ? data : JSON.stringify(data) });
  }
}

let handlers: { [K in keyof VoiceSocketHandlers]: ReturnType<typeof vi.fn> };

function open() {
  const socket = openVoiceSocket(
    "ws://api/api/sessions/s1/voice",
    handlers as unknown as VoiceSocketHandlers,
    (url) => new FakeSocket(url) as unknown as WebSocket,
  );
  return { socket, fake: FakeSocket.instance };
}

beforeEach(() => {
  handlers = {
    onOpen: vi.fn(),
    onTranscript: vi.fn(),
    onTutor: vi.fn(),
    onFollowUp: vi.fn(),
    onSpeech: vi.fn(),
    onError: vi.fn(),
    onDone: vi.fn(),
  };
});

describe("openVoiceSocket", () => {
  it("routes the server's messages to the handlers", () => {
    const { fake } = open();
    expect(fake.binaryType).toBe("arraybuffer");
    fake.open();
    const wav = new ArrayBuffer(4);
    fake.receive({ type: "transcript", text: "I finish it" });
    fake.receive({ type: "tutor", kind: "hint", message: "When?", selfCorrected: false, support: "Pense no passado.", mistake: "I finish" });
    fake.receive(wav);
    fake.receive({ type: "error", code: "voice_unavailable", message: "Down." });
    fake.receive({ type: "done" });
    fake.receive("garbage");

    expect(handlers.onOpen).toHaveBeenCalled();
    expect(handlers.onTranscript).toHaveBeenCalledWith("I finish it");
    expect(handlers.onTutor).toHaveBeenCalledWith({
      kind: "hint",
      message: "When?",
      selfCorrected: false,
      support: "Pense no passado.",
      mistake: "I finish",
    });
    expect(handlers.onSpeech).toHaveBeenCalledWith(wav);
    expect(handlers.onError).toHaveBeenCalledWith("voice_unavailable", "Down.");
    expect(handlers.onDone).toHaveBeenCalledTimes(1);
  });

  it("keeps the stop-or-keep-going question and the covered goals of a tutor line", () => {
    const { fake } = open();
    fake.open();
    fake.receive({ type: "tutor", kind: "reply", message: "Great.", selfCorrected: false, support: null, checkIn: true, coveredGoals: ["today"] });
    expect(handlers.onTutor).toHaveBeenCalledWith({ kind: "reply", message: "Great.", selfCorrected: false, checkIn: true, coveredGoals: ["today"] });
  });

  it("routes a follow-up after the reply, with or without a spoken line", () => {
    const { fake } = open();
    fake.open();
    fake.receive({ type: "followup", kind: "hint", message: "When?", selfCorrected: false, support: "Passado.", mistake: "I finish", checkIn: false, coveredGoals: [] });
    fake.receive({ type: "followup", kind: "reply", message: null, selfCorrected: false, support: null, mistake: null, checkIn: false, coveredGoals: ["today"] });
    expect(handlers.onFollowUp).toHaveBeenNthCalledWith(1, {
      kind: "hint",
      message: "When?",
      selfCorrected: false,
      support: "Passado.",
      mistake: "I finish",
      checkIn: false,
      coveredGoals: [],
    });
    expect(handlers.onFollowUp).toHaveBeenNthCalledWith(2, { kind: "reply", message: null, selfCorrected: false, checkIn: false, coveredGoals: ["today"] });
  });

  it("keeps the guided track and the words to say, null included", () => {
    const { fake } = open();
    fake.open();
    const track = { stage: "swap", number: 2, total: 5 };
    fake.receive({ type: "tutor", kind: "reply", message: "Now yours.", selfCorrected: false, track, scaffold: "Yesterday I…" });
    fake.receive({ type: "followup", kind: "reply", message: null, selfCorrected: false, track: null, scaffold: null });
    expect(handlers.onTutor).toHaveBeenCalledWith({ kind: "reply", message: "Now yours.", selfCorrected: false, track, scaffold: "Yesterday I…" });
    expect(handlers.onFollowUp).toHaveBeenCalledWith({ kind: "reply", message: null, selfCorrected: false, track: null, scaffold: null });
  });

  it("sends turns, typed text and speak requests", () => {
    const { socket, fake } = open();
    fake.open();
    const wav = new ArrayBuffer(8);
    socket.sendTurn(wav);
    socket.sendText("I finished it");
    socket.speakLast();
    expect(fake.sent).toEqual([wav, '{"type":"text","text":"I finished it"}', '{"type":"speak"}']);
  });

  it("reports a lost connection, but not one we closed", () => {
    const first = open();
    first.fake.open();
    first.fake.close();
    expect(handlers.onError).toHaveBeenCalledWith("disconnected", expect.any(String));

    handlers.onError.mockClear();
    const second = open();
    second.fake.open();
    second.socket.close();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it.each([
    [4409, "in_use"],
    [1009, "too_long"],
    [1006, "disconnected"],
  ])("explains close code %i as %s", (code, kind) => {
    const { fake } = open();
    fake.open();
    fake.close(code);
    expect(handlers.onError).toHaveBeenCalledWith(kind, expect.any(String));
  });

  it("reports sending on a closed socket instead of dropping the turn silently", () => {
    const { socket } = open();
    socket.sendText("hello");
    expect(handlers.onError).toHaveBeenCalledWith("disconnected", expect.any(String));
  });
});
