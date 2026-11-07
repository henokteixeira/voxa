import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../domain/conversation/types.js";
import { VoiceUnavailableError } from "../domain/ports/voice.port.js";
import { type ConversationService, SessionEndedError, SessionNotFoundError } from "./conversation.service.js";
import { VoiceConversationService } from "./voice-conversation.service.js";

const id = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const session: Session = {
  id,
  language: "en-US",
  mode: "daily",
  pending: null,
  startedAt: new Date(),
  endedAt: null,
  coveredGoals: [],
  lastCheckInAt: null,
  targets: [],
  metTargets: [],
};
const reply = { kind: "hint" as const, message: "When did it happen?", selfCorrected: false };

const stt = { transcribe: vi.fn() };
const tts = { synthesize: vi.fn() };
const sessions = { get: vi.fn(), history: vi.fn() };
const conversation = { respond: vi.fn() };
const events = { transcript: vi.fn(), tutor: vi.fn(), cancelled: vi.fn(), timing: vi.fn() };
let service: VoiceConversationService;

beforeEach(() => {
  vi.resetAllMocks();
  sessions.get.mockResolvedValue(session);
  events.cancelled.mockReturnValue(false);
  stt.transcribe.mockResolvedValue({ text: " Yesterday I finish it. ", language: "en-US" });
  conversation.respond.mockResolvedValue(reply);
  tts.synthesize.mockResolvedValue(Buffer.from("wav"));
  service = new VoiceConversationService(
    conversation as unknown as ConversationService,
    sessions as never,
    stt,
    tts,
  );
});

describe("turn", () => {
  it("transcribes the audio in the session's language, asks the tutor and speaks the answer", async () => {
    const audio = Buffer.from("audio");

    const speech = await service.turn(id, { audio, mimeType: "audio/wav" }, events);

    expect(stt.transcribe).toHaveBeenCalledWith(audio, "en-US", { mimeType: "audio/wav" });
    expect(events.transcript).toHaveBeenCalledWith("Yesterday I finish it.");
    expect(conversation.respond).toHaveBeenCalledWith(id, "Yesterday I finish it.");
    expect(events.tutor).toHaveBeenCalledWith(reply);
    expect(tts.synthesize).toHaveBeenCalledWith("When did it happen?", "en-US");
    expect(speech).toEqual(Buffer.from("wav"));
  });

  it("skips speech-to-text when the learner typed the turn", async () => {
    await service.turn(id, { text: "  I finished it " }, events);

    expect(stt.transcribe).not.toHaveBeenCalled();
    expect(events.transcript).toHaveBeenCalledWith("I finished it");
    expect(conversation.respond).toHaveBeenCalledWith(id, "I finished it");
  });

  it("returns null without asking the tutor when nothing was said", async () => {
    stt.transcribe.mockResolvedValue({ text: "  ", language: "en-US" });

    await expect(service.turn(id, { audio: Buffer.from("noise"), mimeType: "audio/wav" }, events)).resolves.toBeNull();

    expect(events.transcript).not.toHaveBeenCalled();
    expect(conversation.respond).not.toHaveBeenCalled();
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
    await expect(service.turn(id, { text: "hi" }, events)).resolves.toBeNull();
    expect(events.tutor).toHaveBeenCalledWith(reply);
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it("does not ask the tutor after the learner left", async () => {
    events.cancelled.mockReturnValue(true);
    await expect(service.turn(id, { text: "hi" }, events)).resolves.toBeNull();
    expect(conversation.respond).not.toHaveBeenCalled();
  });

  it("has already sent the tutor's text when the voice fails", async () => {
    tts.synthesize.mockRejectedValue(new VoiceUnavailableError("down"));

    await expect(service.turn(id, { text: "hi" }, events)).rejects.toBeInstanceOf(VoiceUnavailableError);

    expect(events.tutor).toHaveBeenCalledWith(reply);
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
  });

  it("reports no speech-to-text time for a typed turn", async () => {
    clockSteps(0, 0, 3000, 500);

    await service.turn(id, { text: "hi" }, events);

    expect(events.timing).toHaveBeenCalledWith({ sttMs: null, tutorMs: 3000, ttsMs: 500, totalMs: 3500 });
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

    await expect(service.speakLast(id)).resolves.toEqual(Buffer.from("wav"));

    expect(tts.synthesize).toHaveBeenCalledWith("What did you do yesterday?", "en-US");
  });

  it("returns null when the tutor has not spoken yet", async () => {
    sessions.history.mockResolvedValue([]);
    await expect(service.speakLast(id)).resolves.toBeNull();
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it("fails for an unknown or ended session", async () => {
    sessions.get.mockResolvedValue(null);
    await expect(service.speakLast(id)).rejects.toBeInstanceOf(SessionNotFoundError);
    sessions.get.mockResolvedValue({ ...session, endedAt: new Date() });
    await expect(service.speakLast(id)).rejects.toBeInstanceOf(SessionEndedError);
  });
});
