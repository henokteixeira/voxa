import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../domain/conversation/types.js";
import { VoiceUnavailableError } from "../domain/ports/voice.port.js";
import { SessionEndedError, SessionNotFoundError } from "../domain/conversation/session-errors.js";
import type { TurnService } from "./turn.service.js";
import { VoiceConversationService } from "./voice-conversation.service.js";

const id = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const session: Session = {
  id,
  missionId: null,
  language: "en-US",
  mode: "daily",
  pending: null,
  withdrawnMistakes: [],
  startedAt: new Date(),
  endedAt: null,
  coveredGoals: [],
  lastCheckInAt: null,
  targets: [],
  metTargets: [],
  step: "conversation",
  scaffold: null,
  track: null,
  memory: { facts: [], recentSessions: [] },
};
const reply = { kind: "hint" as const, message: "When did it happen?", selfCorrected: false };

const stt = { transcribe: vi.fn() };
const tts = { synthesize: vi.fn() };
const sessions = { get: vi.fn(), history: vi.fn() };
const turns = { respond: vi.fn() };
const events = {
  transcript: vi.fn(),
  tutor: vi.fn(),
  speech: vi.fn(),
  followUp: vi.fn(),
  cancelled: vi.fn(),
  timing: vi.fn(),
};
const metrics = { voiceTurn: vi.fn() };
let service: VoiceConversationService;

beforeEach(() => {
  vi.resetAllMocks();
  sessions.get.mockResolvedValue(session);
  events.cancelled.mockReturnValue(false);
  stt.transcribe.mockResolvedValue({ text: " Yesterday I finish it. ", language: "en-US" });
  turns.respond.mockResolvedValue(reply);
  tts.synthesize.mockResolvedValue(Buffer.from("wav"));
  service = new VoiceConversationService(
    turns as unknown as TurnService,
    sessions as never,
    stt,
    tts,
    metrics,
  );
});

describe("turn", () => {
  it("transcribes the audio in the session's language, asks the tutor and speaks the answer", async () => {
    const audio = Buffer.from("audio");

    await service.turn(id, { audio, mimeType: "audio/wav" }, events);

    expect(stt.transcribe).toHaveBeenCalledWith(audio, "en-US", { mimeType: "audio/wav" });
    expect(events.transcript).toHaveBeenCalledWith("Yesterday I finish it.");
    expect(turns.respond).toHaveBeenCalledWith(id, "Yesterday I finish it.", expect.any(Function));
    expect(events.tutor).toHaveBeenCalledWith(reply);
    expect(tts.synthesize).toHaveBeenCalledWith("When did it happen?", "en-US");
    expect(events.speech).toHaveBeenCalledWith(Buffer.from("wav"));
  });

  it("makes and sends the voice one sentence at a time, in order", async () => {
    turns.respond.mockResolvedValue({ ...reply, message: "Good, you finished the upload. When did that happen, this morning?" });
    tts.synthesize.mockImplementation(async (text: string) => Buffer.from(text));
    events.speech.mockImplementation(() => {
      // The second sentence is made only after the first was sent.
      expect(tts.synthesize).toHaveBeenCalledTimes(events.speech.mock.calls.length);
    });

    await service.turn(id, { text: "hi" }, events);

    expect(events.speech.mock.calls.map(([wav]) => String(wav))).toEqual(["Good, you finished the upload.", "When did that happen, this morning?"]);
  });

  it("skips speech-to-text when the learner typed the turn", async () => {
    await service.turn(id, { text: "  I finished it " }, events);

    expect(stt.transcribe).not.toHaveBeenCalled();
    expect(events.transcript).toHaveBeenCalledWith("I finished it");
    expect(turns.respond).toHaveBeenCalledWith(id, "I finished it", expect.any(Function));
  });

  it("does not ask the tutor when nothing was said", async () => {
    stt.transcribe.mockResolvedValue({ text: "  ", language: "en-US" });

    await service.turn(id, { audio: Buffer.from("noise"), mimeType: "audio/wav" }, events);

    expect(events.transcript).not.toHaveBeenCalled();
    expect(turns.respond).not.toHaveBeenCalled();
  });

  it("checks the session before spending a transcription", async () => {
    sessions.get.mockResolvedValue(null);
    await expect(service.turn(id, { audio: Buffer.from("a"), mimeType: "audio/wav" }, events)).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
    sessions.get.mockResolvedValue({ ...session, endedAt: new Date() });
    await expect(service.turn(id, { text: "hi" }, events)).rejects.toBeInstanceOf(SessionEndedError);
    expect(stt.transcribe).not.toHaveBeenCalled();
  });

  it("does not synthesize speech after the learner left", async () => {
    events.cancelled.mockReturnValueOnce(false).mockReturnValue(true);
    await service.turn(id, { text: "hi" }, events);
    expect(events.tutor).toHaveBeenCalledWith(reply);
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it("does not ask the tutor after the learner left", async () => {
    events.cancelled.mockReturnValue(true);
    await service.turn(id, { text: "hi" }, events);
    expect(turns.respond).not.toHaveBeenCalled();
  });

  it("has already sent the tutor's text when the voice fails", async () => {
    tts.synthesize.mockRejectedValue(new VoiceUnavailableError("down"));

    await expect(service.turn(id, { text: "hi" }, events)).rejects.toBeInstanceOf(VoiceUnavailableError);

    expect(events.tutor).toHaveBeenCalledWith(reply);
  });
});

describe("turn: the reply first, then what follows it", () => {
  const first = { kind: "reply" as const, message: "Nice. What's next?", selfCorrected: false };
  const hint = { kind: "hint" as const, message: "When did it happen?", selfCorrected: false };

  /** The tutor hands over its reply, then answers with `then` once the analysis is done. */
  function replyFirst(then: object, analysis: Promise<void> = Promise.resolve()) {
    turns.respond.mockImplementation(async (_id: string, _text: string, onReply: (r: object) => void) => {
      onReply(first);
      await analysis;
      return then;
    });
  }

  it("speaks the reply as soon as it is written, then the hint", async () => {
    let finish = () => {};
    replyFirst(hint, new Promise<void>((resolve) => (finish = resolve)));
    tts.synthesize.mockImplementation(async (text: string) => Buffer.from(text));

    const turn = service.turn(id, { text: "Yesterday I finish it" }, events);
    await vi.waitFor(() => expect(events.speech).toHaveBeenCalledWith(Buffer.from("Nice. What's next?")));
    expect(events.followUp).not.toHaveBeenCalled();
    finish();

    await turn;
    expect(events.speech).toHaveBeenLastCalledWith(Buffer.from("When did it happen?"));
    expect(events.tutor).toHaveBeenCalledWith(first);
    expect(events.followUp).toHaveBeenCalledWith(hint);
  });

  it("sends the follow-up after the reply's speech, even when the analysis ends first", async () => {
    replyFirst(hint);
    const order: string[] = [];
    tts.synthesize.mockImplementation(async (text: string) => {
      if (text === first.message) await new Promise((resolve) => setTimeout(resolve, 5));
      return Buffer.from(text);
    });
    events.speech.mockImplementation(() => order.push("speech"));
    events.followUp.mockImplementation(() => order.push("followUp"));

    await service.turn(id, { text: "hi" }, events);

    // The follow-up's own speech comes after it.
    expect(order).toEqual(["speech", "followUp", "speech"]);
  });

  it("has no more speech when nothing follows the reply", async () => {
    replyFirst({ kind: "reply", message: "", selfCorrected: false });

    await service.turn(id, { text: "hi" }, events);

    expect(tts.synthesize).toHaveBeenCalledTimes(1);
    expect(events.followUp).toHaveBeenCalledWith({ kind: "reply", message: "", selfCorrected: false });
  });

  it("does not speak the reply after the learner left", async () => {
    events.cancelled.mockReturnValueOnce(false).mockReturnValue(true);
    replyFirst(hint);

    await service.turn(id, { text: "hi" }, events);

    expect(tts.synthesize).not.toHaveBeenCalled();
    expect(events.speech).not.toHaveBeenCalled();
    expect(events.followUp).not.toHaveBeenCalled();
  });

  it("sends nothing after the reply's speech once the learner left", async () => {
    replyFirst(hint);
    events.speech.mockImplementation(() => events.cancelled.mockReturnValue(true));

    await service.turn(id, { text: "hi" }, events);

    expect(events.speech).toHaveBeenCalledTimes(1);
    expect(events.followUp).not.toHaveBeenCalled();
  });

  it("fails the turn after the follow-up when the follow-up's voice fails", async () => {
    replyFirst(hint);
    tts.synthesize.mockImplementation(async (text: string) => {
      if (text === hint.message) throw new VoiceUnavailableError("down");
      return Buffer.from(text);
    });

    await expect(service.turn(id, { text: "hi" }, events)).rejects.toBeInstanceOf(VoiceUnavailableError);

    expect(events.speech).toHaveBeenCalledTimes(1);
    expect(events.followUp).toHaveBeenCalledWith(hint);
  });

  it("fails the turn when the reply's voice fails", async () => {
    replyFirst(hint);
    tts.synthesize.mockRejectedValue(new VoiceUnavailableError("down"));

    await expect(service.turn(id, { text: "hi" }, events)).rejects.toBeInstanceOf(VoiceUnavailableError);

    expect(events.followUp).not.toHaveBeenCalled();
  });

  it("waits for the reply's speech before reporting that the tutor failed", async () => {
    const failure = new Error("tutor down");
    turns.respond.mockImplementation(async (_id: string, _text: string, onReply: (r: object) => void) => {
      onReply(first);
      throw failure;
    });
    tts.synthesize.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return Buffer.from("wav");
    });

    await expect(service.turn(id, { text: "hi" }, events)).rejects.toBe(failure);

    expect(events.speech).toHaveBeenCalled();
  });
});

describe("turn timing", () => {
  afterEach(() => vi.restoreAllMocks());

  /** Each call to the clock moves it forward by the next step, so every stage gets a known duration. */
  function clockSteps(...steps: number[]) {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
      now += steps.shift() ?? 0;
      return now;
    });
  }

  it("reports how long speech-to-text, the tutor and text-to-speech took", async () => {
    clockSteps(0, 2500, 4000, 800);

    await service.turn(id, { audio: Buffer.from("audio"), mimeType: "audio/wav" }, events);

    expect(events.timing).toHaveBeenCalledWith({ sttMs: 2500, tutorMs: 4000, ttsMs: 800, totalMs: 7300 });
    expect(metrics.voiceTurn).toHaveBeenCalledWith({ sessionId: id, sttMs: 2500, tutorMs: 4000, ttsMs: 800, totalMs: 7300 });
  });

  it("reports no speech-to-text time for a typed turn", async () => {
    clockSteps(0, 0, 3000, 500);

    await service.turn(id, { text: "hi" }, events);

    expect(events.timing).toHaveBeenCalledWith({ sttMs: null, tutorMs: 3000, ttsMs: 500, totalMs: 3500 });
  });

  it("measures up to the reply's voice when the reply comes first", async () => {
    clockSteps(0, 2000, 3000, 900);
    turns.respond.mockImplementation(async (_id: string, _text: string, onReply: (r: object) => void) => {
      onReply({ kind: "reply", message: "Nice.", selfCorrected: false });
      return { kind: "reply", message: "", selfCorrected: false };
    });

    await service.turn(id, { audio: Buffer.from("audio"), mimeType: "audio/wav" }, events);

    expect(events.timing).toHaveBeenCalledWith({ sttMs: 2000, tutorMs: 3000, ttsMs: 900, totalMs: 5900 });
  });

  it("reports nothing when the turn did not reach the voice", async () => {
    events.cancelled.mockReturnValueOnce(false).mockReturnValue(true);

    await service.turn(id, { text: "hi" }, events);

    expect(events.timing).not.toHaveBeenCalled();
  });
});

describe("speakLast", () => {
  it("speaks the tutor's last line again", async () => {
    sessions.history.mockResolvedValue([
      { role: "assistant", content: "Morning!" },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "What did you do yesterday?" },
      { role: "user", content: "I…" },
    ]);

    await service.speakLast(id, events);

    expect(tts.synthesize).toHaveBeenCalledWith("What did you do yesterday?", "en-US");
    expect(events.speech).toHaveBeenCalledWith(Buffer.from("wav"));
  });

  it("says nothing when the tutor has not spoken yet", async () => {
    sessions.history.mockResolvedValue([]);
    await service.speakLast(id, events);
    expect(tts.synthesize).not.toHaveBeenCalled();
    expect(events.speech).not.toHaveBeenCalled();
  });

  it("fails for an unknown or ended session", async () => {
    sessions.get.mockResolvedValue(null);
    await expect(service.speakLast(id, events)).rejects.toBeInstanceOf(SessionNotFoundError);
    sessions.get.mockResolvedValue({ ...session, endedAt: new Date() });
    await expect(service.speakLast(id, events)).rejects.toBeInstanceOf(SessionEndedError);
  });
});
