import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import { routes as lazyRoutes } from "@/app/router";
import { eagerRoutes } from "@/test/eager-routes";
import { ApiError, type ApiClient } from "@/lib/api";
import { type MicrophoneHandlers, MicrophoneUnavailableError } from "@/lib/voice/microphone";
import { savePauseMs } from "@/lib/voice/pause-setting";
import type { VoiceSocketHandlers } from "@/lib/voice/voice-socket";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { type VoiceDeps, VoiceDepsContext } from "./voice-deps";

const routes = await eagerRoutes(lazyRoutes);

let micHandlers: MicrophoneHandlers;
let socketHandlers: VoiceSocketHandlers;
const mic = { pause: vi.fn(), resume: vi.fn(() => micHandlers.onListening?.()), sendNow: vi.fn(), unlock: vi.fn(), stop: vi.fn() };
const socket = { sendTurn: vi.fn(), sendText: vi.fn(), speakLast: vi.fn(), close: vi.fn() };
const speaker = { play: vi.fn(), stop: vi.fn(), unlock: vi.fn(), close: vi.fn() };
let finishPlayback: () => void;

const api = {
  health: vi.fn(),
  startSession: vi.fn(),
  sendTurn: vi.fn(),
  endSession: vi.fn(),
  saveTiming: vi.fn(),
  resumeSession: vi.fn(),
  fillerSpeech: vi.fn(),
  // A learner who already has a level: without one, Today opens the onboarding.
  level: () =>
    Promise.resolve({
      current: { language: "en", level: "B1", source: "placement", evidence: [], assessedAt: "2026-11-07T10:00:00Z", step: "supported" },
      placementDue: false,
    }),
  todayProgress: vi.fn(),
  reviewCard: vi.fn(),
  answerReview: vi.fn(),
  transcribe: vi.fn(),
  // The mission page, after step 3: it stays loading in these tests.
  missionToday: vi.fn(() => new Promise(() => {})),
  voiceUrl: (id: string) => `ws://api/api/sessions/${id}/voice`,
} as unknown as ApiClient & { [K in "health" | "startSession" | "endSession" | "saveTiming" | "resumeSession" | "fillerSpeech" | "todayProgress" | "reviewCard" | "answerReview" | "transcribe" | "missionToday"]: ReturnType<typeof vi.fn> };

const deps: VoiceDeps = {
  openMicrophone: vi.fn(async (handlers: MicrophoneHandlers) => {
    micHandlers = handlers;
    return mic;
  }),
  openVoiceSocket: vi.fn((_url: string, handlers: VoiceSocketHandlers) => {
    socketHandlers = handlers;
    return socket;
  }),
  createSpeaker: () => speaker,
};

function todayWith(earnedXp: number) {
  return {
    day: "2026-11-07",
    minutesPerDay: 30,
    goalXp: 40,
    earnedXp,
    goalMet: earnedXp >= 40,
    streakDays: 2,
    points: { practice_minute: 1, goal_covered: 5, self_corrected: 5, personal_record: 5 },
  };
}

let cleanupApp: () => void = () => {};

const noSignals = { selfCorrectionRate: null, mistakesPer100Words: null, averagePauseMs: null, wordsPerMinute: null, longPausesPerMinute: null };
function summaryWith(mistakes: unknown[], extra: Record<string, unknown> = {}) {
  return {
    sessionId: "s1",
    mode: "daily",
    mistakes,
    selfCorrections: 0,
    signals: noSignals,
    ...extra,
  };
}
const mistake = (severity: "serious" | "minor", selfCorrected: boolean, original: string, correction: string) => ({
  original,
  correction,
  category: "grammar",
  severity,
  selfCorrected,
  occurrences: 1,
});

function renderSession(path = "/session/daily", { withLocale = false } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const app = (
    <ApiProvider value={api}>
      <VoiceDepsContext.Provider value={deps}>
        <RouterProvider router={router} />
      </VoiceDepsContext.Provider>
    </ApiProvider>
  );
  cleanupApp = render(withLocale ? <LocaleProvider>{app}</LocaleProvider> : app).unmount;
  return router;
}

const SHOW_TUTOR = /^(Show what the tutor said|Ver o que o tutor disse)$/;
/** Waits for the session to open: the tutor's opening line arrives, hidden behind a tap. */
const opened = () => screen.findByRole("button", { name: SHOW_TUTOR });

/** Starts a session and plays the opening line through to the learner's turn. */
async function startAndListen(options: { withLocale?: boolean; path?: string } = {}) {
  renderSession(options.path ?? "/session/daily", options);
  await opened();
  act(() => socketHandlers.onOpen());
  act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
  act(() => socketHandlers.onDone());
  await act(async () => finishPlayback());
  if (!options.withLocale) expect(await screen.findByText("Your turn")).toBeInTheDocument();
}

beforeEach(() => {
  vi.clearAllMocks();
  api.health.mockResolvedValue({ status: "ok" });
  api.endSession.mockResolvedValue(summaryWith([]));
  api.saveTiming.mockResolvedValue(undefined);
  api.fillerSpeech.mockResolvedValue([]);
  api.todayProgress.mockResolvedValue(todayWith(20));
  api.startSession.mockResolvedValue({
    sessionId: "s1",
    mode: "daily",
    language: "en",
    message: "Morning! What did you work on yesterday?",
  });
  speaker.play.mockImplementation((_wav: ArrayBuffer, onStart?: () => void) => {
    onStart?.();
    return new Promise<void>((resolve) => (finishPlayback = resolve));
  });
});

describe("live session", () => {
  it("hides the tutor's line until the learner taps, so they listen first", async () => {
    await startAndListen();
    expect(screen.queryByText("Morning! What did you work on yesterday?")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show what the tutor said" }));
    expect(screen.getByText("Morning! What did you work on yesterday?")).toBeInTheDocument();

    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("I fixed the login bug"));
    expect(screen.getByText("I fixed the login bug")).toBeInTheDocument();

    act(() => socketHandlers.onTutor({ kind: "reply", message: "Nice. What's next?", selfCorrected: false }));
    expect(screen.queryByText("Nice. What's next?")).not.toBeInTheDocument();
    // The learner's words stay on screen for a moment, so they can check them.
    expect(screen.getByText("I fixed the login bug")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show what the tutor said" }));
    expect(screen.getByText("Nice. What's next?")).toHaveFocus();
    // A long line scrolls inside its card, so the screen does not grow with it.
    expect(screen.getByText("Nice. What's next?")).toHaveClass("overflow-y-auto");

    // The same link hides the line again.
    await userEvent.click(screen.getByRole("button", { name: "Hide what the tutor said" }));
    expect(screen.queryByText("Nice. What's next?")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show what the tutor said" }));

    // Opening the transcript and closing it again keeps the line revealed.
    await userEvent.click(screen.getByRole("button", { name: "Show transcript" }));
    await userEvent.click(screen.getByRole("button", { name: "Hide transcript" }));
    expect(screen.getByText("Nice. What's next?")).toBeInTheDocument();
  });

  it("fades the learner's words after a time that grows with them, keeping them in the transcript", async () => {
    await startAndListen();
    vi.useFakeTimers();
    try {
      act(() => micHandlers.onTurn(new ArrayBuffer(16)));
      act(() => socketHandlers.onTranscript("I fixed the login bug"));
      act(() => socketHandlers.onTutor({ kind: "reply", message: "Nice. What's next?", selfCorrected: false }));
      act(() => vi.advanceTimersByTime(2900));
      expect(screen.getByText("I fixed the login bug")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1500));
      expect(screen.queryByText("I fixed the login bug")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
    await userEvent.click(screen.getByRole("button", { name: "Show transcript" }));
    expect(screen.getByRole("list", { name: "Transcript" })).toHaveTextContent("I fixed the login bug");
    // Closing the transcript does not bring the faded line back.
    await userEvent.click(screen.getByRole("button", { name: "Hide transcript" }));
    expect(screen.queryByText("I fixed the login bug")).not.toBeInTheDocument();
  });

  it("puts the help inside the correction card instead of stacking another card", async () => {
    await startAndListen();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("I will reveal the suggestions"));
    act(() =>
      socketHandlers.onTutor({
        kind: "reveal",
        message: "Here is one way to say it: review the suggestions.",
        selfCorrected: false,
        support: "“Reveal” quer dizer “revelar”.",
      }),
    );
    const card = screen.getByRole("region", { name: "The correct form" });
    expect(card).toHaveTextContent("Here is one way to say it: review the suggestions.");
    expect(card).toHaveTextContent("Saved to your mistake bank");
    expect(within(card).getByRole("note", { name: "Help" })).toHaveTextContent("“Reveal” quer dizer “revelar”.");
    expect(screen.getAllByRole("note")).toHaveLength(1);
  });

  it("puts the help inside the hint card too", async () => {
    await startAndListen();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("Yesterday I finish it"));
    act(() =>
      socketHandlers.onTutor({ kind: "hint", message: "When did it happen?", selfCorrected: false, support: "Pense no passado." }),
    );
    const card = screen.getByRole("region", { name: "Hint 1 of 2" });
    expect(within(card).getByRole("note", { name: "Help" })).toHaveTextContent("Pense no passado.");
    expect(screen.getAllByRole("note")).toHaveLength(1);
  });

  it("still shows the correct form on its own after two hints", async () => {
    await startAndListen();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("I finish it"));
    act(() => socketHandlers.onTutor({ kind: "reveal", message: "I finished it yesterday.", selfCorrected: false }));
    expect(screen.getByRole("region", { name: "The correct form" })).toHaveTextContent("I finished it yesterday.");
    expect(screen.queryByRole("button", { name: "Show what the tutor said" })).not.toBeInTheDocument();
  });

  it("names the mistake's type on the hint, and shows its rule with the correct form", async () => {
    await startAndListen();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("Yesterday I finish it"));
    act(() => socketHandlers.onTutor({ kind: "hint", message: "When did it happen?", selfCorrected: false, mistakeType: "verb_tense" }));
    expect(screen.getByRole("region", { name: "Hint 1 of 2" })).toHaveTextContent("Hint · Verb tense");

    const rule = { name: "Past for finished actions", rule: "Ação que já terminou: verbo no passado." };
    act(() => socketHandlers.onTutor({ kind: "reveal", message: "I finished it yesterday.", selfCorrected: false, mistakeType: "verb_tense", rule }));
    expect(screen.getByRole("region", { name: "The correct form" })).toHaveTextContent(`${rule.name}. ${rule.rule}`);
  });

  it("keeps the whole conversation readable from the transcript button", async () => {
    await startAndListen();
    await userEvent.click(screen.getByRole("button", { name: "Show transcript" }));
    expect(screen.getByRole("list", { name: "Transcript" })).toHaveTextContent("Morning! What did you work on yesterday?");
  });

  it("starts the session, speaks the opening line, then listens", async () => {
    await startAndListen();
    expect(api.startSession).toHaveBeenCalledWith("daily", undefined, undefined);
    expect(deps.openVoiceSocket).toHaveBeenCalledWith("ws://api/api/sessions/s1/voice", expect.anything());
    expect(socket.speakLast).toHaveBeenCalled();
    expect(speaker.play).toHaveBeenCalled();
    expect(mic.resume).toHaveBeenCalled();
    expect(screen.getByText("Daily stand-up")).toBeInTheDocument();
  });

  it("keeps the turn the learner started: the microphone is not restarted when they start talking", async () => {
    await startAndListen();
    mic.resume.mockClear();
    mic.pause.mockClear();

    act(() => micHandlers.onSpeechStart());

    expect(screen.getByText("Listening")).toBeInTheDocument();
    // Restarting it would drop what was heard and stop the detector, so the turn could never end or be sent.
    expect(mic.resume).not.toHaveBeenCalled();
    expect(mic.pause).not.toHaveBeenCalled();
  });

  it("plays the reply and then the hint after it, and listens only after both", async () => {
    await startAndListen();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("Yesterday I finish it"));
    act(() => socketHandlers.onTutor({ kind: "reply", message: "Nice. What's next?", selfCorrected: false }));
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    act(() => socketHandlers.onFollowUp({ kind: "hint", message: "When did it happen?", selfCorrected: false }));
    act(() => socketHandlers.onSpeech(new ArrayBuffer(9)));
    act(() => socketHandlers.onDone());
    mic.resume.mockClear();

    // One clip at a time: the hint waits for the reply to finish.
    expect(speaker.play).toHaveBeenCalledTimes(2);
    await act(async () => finishPlayback());
    expect(speaker.play).toHaveBeenCalledTimes(3);
    expect(speaker.play.mock.calls[2][0].byteLength).toBe(9);
    expect(screen.getByText("Speaking")).toBeInTheDocument();
    expect(mic.resume).not.toHaveBeenCalled();

    await act(async () => finishPlayback());
    expect(mic.resume).toHaveBeenCalled();
  });

  it("stays silent for the rest of the turn after the learner stops the tutor", async () => {
    await startAndListen();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTutor({ kind: "reply", message: "Nice.", selfCorrected: false }));
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    await userEvent.click(screen.getByRole("button", { name: "Stop the tutor" }));
    const plays = speaker.play.mock.calls.length;
    act(() => socketHandlers.onSpeech(new ArrayBuffer(9)));
    expect(speaker.play).toHaveBeenCalledTimes(plays);
  });

  it("lets the learner stop the tutor between two parts of its voice", async () => {
    await startAndListen();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTutor({ kind: "reply", message: "Nice. Tell me more about it.", selfCorrected: false }));
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    await act(async () => finishPlayback());
    await userEvent.click(screen.getByRole("button", { name: "Stop the tutor" }));
    const plays = speaker.play.mock.calls.length;
    act(() => socketHandlers.onSpeech(new ArrayBuffer(9)));
    expect(speaker.play).toHaveBeenCalledTimes(plays);
  });

  it("says once, in the first session, that the ball can be tapped", async () => {
    localStorage.removeItem("voxa.ballTipSeen");
    await startAndListen();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTutor({ kind: "reply", message: "Nice.", selfCorrected: false }));
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    const tip = "Tip: tap the ball to send what you said, or to stop Voxa talking.";
    expect(screen.getByText(tip)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Stop the tutor" }));
    expect(screen.queryByText(tip)).not.toBeInTheDocument();
    expect(localStorage.getItem("voxa.ballTipSeen")).toBe("1");
  });

  it("plays a hint that arrives after the reply finished", async () => {
    await startAndListen();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTutor({ kind: "reply", message: "Nice.", selfCorrected: false }));
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    await act(async () => finishPlayback());
    expect(mic.resume).toHaveBeenCalledTimes(1);

    act(() => socketHandlers.onFollowUp({ kind: "hint", message: "When did it happen?", selfCorrected: false }));
    act(() => socketHandlers.onSpeech(new ArrayBuffer(9)));
    expect(screen.getByText("Speaking")).toBeInTheDocument();
    act(() => socketHandlers.onDone());
    await act(async () => finishPlayback());
    expect(mic.resume).toHaveBeenCalledTimes(2);
  });

  it("shows the tutor speaking only once its voice is heard", async () => {
    let start: () => void = () => {};
    speaker.play.mockImplementationOnce((_wav: ArrayBuffer, onStart?: () => void) => {
      start = () => onStart?.();
      return new Promise<void>((resolve) => (finishPlayback = resolve));
    });
    renderSession();
    await opened();
    act(() => socketHandlers.onOpen());
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    expect(screen.queryByText("Speaking")).not.toBeInTheDocument();
    // The server is done before the voice is heard: the microphone waits for the voice to end.
    act(() => socketHandlers.onDone());
    expect(mic.resume).not.toHaveBeenCalled();
    act(() => start());
    expect(screen.getByText("Speaking")).toBeInTheDocument();
    await act(async () => finishPlayback());
    expect(mic.resume).toHaveBeenCalledTimes(1);
  });

  it("keeps the microphone off while the tutor speaks", async () => {
    renderSession();
    await opened();
    act(() => socketHandlers.onOpen());
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    expect(screen.getByText("Speaking")).toBeInTheDocument();
    expect(mic.resume).not.toHaveBeenCalled();
  });

  it("sends a finished turn, shows the captions and a hint card", async () => {
    await startAndListen();
    act(() => micHandlers.onSpeechStart());
    expect(screen.getByText("Listening")).toBeInTheDocument();

    const wav = new ArrayBuffer(16);
    act(() => micHandlers.onTurn(wav));
    expect(socket.sendTurn).toHaveBeenCalledWith(wav);
    expect(screen.getByText("Thinking")).toBeInTheDocument();

    act(() => socketHandlers.onTranscript("Yesterday I finish the upload screen"));
    expect(screen.getByText("Yesterday I finish the upload screen")).toBeInTheDocument();
    act(() =>
      socketHandlers.onTutor({ kind: "hint", message: "When did this happen?", selfCorrected: false, mistake: "I finish" }),
    );
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    act(() => socketHandlers.onDone());
    await act(async () => finishPlayback());

    const card = screen.getByRole("region", { name: "Hint 1 of 2" });
    // The hint leads; only the words with the mistake follow, not the whole answer.
    expect(card.querySelector("p")).toHaveTextContent("When did this happen?");
    expect(within(card).getByText("“I finish”")).toBeInTheDocument();
    expect(card).toHaveTextContent("Say it again, fixing these words");
    expect(card).not.toHaveTextContent("upload screen");
    expect(screen.queryByRole("button", { name: "Show what the tutor said" })).not.toBeInTheDocument();
    expect(screen.getByText("Hint · say it again")).toBeInTheDocument();
  });

  it("says a filler line while a slow answer comes, and cuts it for the answer", async () => {
    const fillerClip = new ArrayBuffer(4);
    api.fillerSpeech.mockResolvedValue([fillerClip]);
    await startAndListen();
    expect(api.fillerSpeech).toHaveBeenCalledWith("en");
    vi.useFakeTimers();
    try {
      act(() => micHandlers.onTurn(new ArrayBuffer(16)));
      act(() => socketHandlers.onTranscript("I finished it"));
      act(() => vi.advanceTimersByTime(1000));
      expect(speaker.play).toHaveBeenLastCalledWith(fillerClip);
      expect(screen.getByText("Thinking")).toBeInTheDocument();

      const answer = new ArrayBuffer(8);
      act(() => socketHandlers.onSpeech(answer));
      expect(speaker.stop).toHaveBeenCalled();
      expect(speaker.play).toHaveBeenLastCalledWith(answer, expect.any(Function));
    } finally {
      vi.useRealTimers();
    }
  });

  it("says nothing extra when the answer is quick", async () => {
    api.fillerSpeech.mockResolvedValue([new ArrayBuffer(4)]);
    await startAndListen();
    vi.useFakeTimers();
    try {
      act(() => micHandlers.onTurn(new ArrayBuffer(16)));
      act(() => socketHandlers.onTranscript("I finished it"));
      act(() => vi.advanceTimersByTime(500));
      act(() => socketHandlers.onDone());
      act(() => vi.advanceTimersByTime(1000));
      expect(speaker.play).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says it didn't catch a turn with no speech", async () => {
    await startAndListen();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onDone());
    expect(screen.getByText(/Didn't catch that/)).toBeInTheDocument();
  });

  it("lets the learner type a turn instead", async () => {
    await startAndListen();
    await userEvent.click(screen.getByRole("button", { name: "Type instead" }));
    await userEvent.type(screen.getByLabelText("Your answer"), "I finished it{Enter}");
    expect(socket.sendText).toHaveBeenCalledWith("I finished it");
  });

  it("shows the voice server error and retries the tutor's line without asking again", async () => {
    await startAndListen();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("I finished it"));
    act(() => socketHandlers.onTutor({ kind: "reply", message: "Great.", selfCorrected: false }));
    act(() => socketHandlers.onError("voice_unavailable", "down"));
    act(() => socketHandlers.onDone());

    expect(screen.getByRole("alert", { name: "The voice server isn't running" })).toBeInTheDocument();
    socket.speakLast.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(socket.speakLast).toHaveBeenCalledTimes(1);
    expect(socket.sendText).not.toHaveBeenCalled();
  });

  it("shows a ring around the ball only in the last 15 s of a turn, with no numbers", async () => {
    await startAndListen();
    vi.useFakeTimers();
    try {
      act(() => micHandlers.onSpeechStart());
      expect(screen.getByTestId("turn-ring")).toHaveAttribute("data-shown", "false");
      expect(screen.queryByRole("timer")).not.toBeInTheDocument();
      expect(screen.queryByText(/Voxa sends what you said so far/)).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(46_000));
      expect(screen.getByTestId("turn-ring")).toHaveAttribute("data-shown", "true");
      expect(screen.getByText("At 1:00 Voxa sends what you said so far. Then you can go on.")).toHaveClass("sr-only");
      act(() => micHandlers.onTurn(new ArrayBuffer(16)));
      expect(screen.queryByTestId("turn-ring")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a turn whose speech recognition timed out and sends the same recording again", async () => {
    await startAndListen();
    const wav = new ArrayBuffer(16);
    act(() => micHandlers.onTurn(wav));
    act(() => socketHandlers.onError("voice_unavailable", "STT timed out after 30000 ms"));
    act(() => socketHandlers.onDone());

    expect(screen.getByText("Your answer is kept: no need to say it again.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Trying again by itself (1 of 3)");
    socket.sendTurn.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(socket.sendTurn).toHaveBeenCalledWith(wav);
  });

  it("retries a failed turn by itself, waiting longer each time, then leaves it to the learner", async () => {
    await startAndListen();
    const wav = new ArrayBuffer(16);
    act(() => micHandlers.onTurn(wav));
    vi.useFakeTimers();
    try {
      socket.sendTurn.mockClear();
      const fail = () => act(() => socketHandlers.onError("voice_unavailable", "STT timed out"));
      fail();
      act(() => vi.advanceTimersByTime(1_999));
      expect(socket.sendTurn).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(socket.sendTurn).toHaveBeenCalledTimes(1);
      fail();
      act(() => vi.advanceTimersByTime(5_000));
      fail();
      act(() => vi.advanceTimersByTime(10_000));
      expect(socket.sendTurn).toHaveBeenCalledTimes(3);
      expect(socket.sendTurn).toHaveBeenLastCalledWith(wav);

      fail();
      act(() => vi.advanceTimersByTime(60_000));
      expect(socket.sendTurn).toHaveBeenCalledTimes(3);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resends the transcript when the tutor didn't answer", async () => {
    await startAndListen();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("I finished it"));
    act(() => socketHandlers.onError("tutor_unavailable", "down"));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(socket.sendText).toHaveBeenCalledWith("I finished it");
  });

  it("explains a blocked microphone and does not create a session", async () => {
    vi.mocked(deps.openMicrophone).mockRejectedValueOnce(new MicrophoneUnavailableError("blocked"));
    renderSession();
    expect(await screen.findByRole("alert", { name: "Voxa can't hear you" })).toBeInTheDocument();
    expect(api.startSession).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await opened();
    expect(api.startSession).toHaveBeenCalledTimes(1);
  });

  it("explains a microphone that can't be opened again after the tutor's turn", async () => {
    await startAndListen();
    act(() => micHandlers.onUnavailable?.("blocked"));
    expect(await screen.findByRole("alert", { name: "Voxa can't hear you" })).toBeInTheDocument();
  });

  it("pauses, repeats the last question and ends the session", async () => {
    await startAndListen();

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeInTheDocument();
    socket.speakLast.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Repeat the last question" }));
    expect(socket.speakLast).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(await screen.findByRole("heading", { name: "Session done" })).toBeInTheDocument();
    expect(api.endSession).toHaveBeenCalledWith("s1", expect.objectContaining({ pausesMs: expect.any(Array) }));
    expect(mic.stop).toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalled();
  });

  it("shows the meeting's goals, ticks covered ones and asks whether to stop", async () => {
    api.startSession.mockResolvedValueOnce({
      sessionId: "s1",
      mode: "daily",
      language: "en",
      message: "Morning! What did you work on yesterday?",
      goals: ["yesterday", "today", "blockers"],
    });
    api.endSession.mockResolvedValueOnce(
      summaryWith([], {
        goals: [
          { id: "yesterday", covered: true },
          { id: "today", covered: true },
          { id: "blockers", covered: true },
        ],
        targets: [
          { original: "I goed", correction: "I went", category: "grammar", met: true },
          { original: "more better", correction: "better", category: "grammar", met: false },
        ],
      }),
    );
    await startAndListen();
    const goals = screen.getByRole("list", { name: "Conversation goals" });
    expect(goals).toHaveTextContent("Yesterday");
    expect(goals).not.toHaveTextContent("✓");

    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("All done, no blockers."));
    act(() =>
      socketHandlers.onTutor({
        kind: "reply",
        message: "Thanks. Do you want to stop here or keep going?",
        selfCorrected: false,
        checkIn: true,
        coveredGoals: ["yesterday", "today", "blockers"],
      }),
    );
    act(() => socketHandlers.onDone());

    expect(screen.getByRole("list", { name: "Conversation goals" })).toHaveTextContent("✓ Blockers");
    await userEvent.click(screen.getByRole("button", { name: "Keep going" }));
    expect(screen.queryByRole("region", { name: "Stop here?" })).not.toBeInTheDocument();

    act(() => socketHandlers.onTutor({ kind: "reply", message: "Anything else?", selfCorrected: false, checkIn: true }));
    await userEvent.click(screen.getByRole("button", { name: "Stop and see the summary" }));
    expect(await screen.findByRole("heading", { name: "Session done" })).toBeInTheDocument();
    expect(screen.getByText("Goals: 3 of 3")).toBeInTheDocument();
    expect(screen.getByText(/You got 1 of 2 right/)).toBeInTheDocument();
    expect(screen.getByText("Next time")).toBeInTheDocument();
  });

  it("shows the guided step and hides the model sentence until a tap, with the card at the bottom", async () => {
    const model = "Yesterday I worked on the login screen.";
    api.startSession.mockResolvedValueOnce({
      sessionId: "s1",
      mode: "daily",
      language: "en",
      message: `Say it after me: ${model}`,
      goals: ["yesterday", "today", "blockers"],
      track: { stage: "model", number: 1, total: 5 },
      scaffold: model,
    });
    renderSession();
    // The words to say replace the tutor's line on the main screen.
    await screen.findByRole("button", { name: "Show the sentence" });
    act(() => socketHandlers.onOpen());
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    act(() => socketHandlers.onDone());
    await act(async () => finishPlayback());
    expect(screen.getByText("Say it after me")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Step 1 of 5" })).toBeInTheDocument();
    expect(screen.queryByText(model)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show the sentence" }));
    expect(screen.getByText(model)).toHaveFocus();

    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript(model));
    act(() =>
      socketHandlers.onTutor({
        kind: "reply",
        message: "Great. Now say it with what you did.",
        selfCorrected: false,
        track: { stage: "swap", number: 2, total: 5 },
        scaffold: "Yesterday I worked on the audio upload.",
      }),
    );
    expect(screen.getByRole("img", { name: "Step 2 of 5" })).toBeInTheDocument();
    // Past the model, the words show at once, under the learner's own last words.
    expect(screen.getByText("Swap in what you did")).toBeInTheDocument();
    expect(screen.getByText(model)).toBeInTheDocument();
    expect(screen.getByText("Yesterday I worked on the audio upload.")).toBeInTheDocument();
  });

  it("shows a sentence start outside the track when the learner is stuck (B1)", async () => {
    await startAndListen();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("I don't know."));
    act(() =>
      socketHandlers.onTutor({ kind: "reply", message: "No problem. Try: Today I'm going to...", selfCorrected: false, track: null, scaffold: "Today I'm going to…" }),
    );
    expect(screen.getByText("Finish the sentence")).toBeInTheDocument();
    expect(screen.getByText("Today I'm going to…")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Step \d of 5/ })).not.toBeInTheDocument();

    // Once the learner answers, the sentence start leaves the screen.
    act(() => socketHandlers.onDone());
    await act(async () => finishPlayback());
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("Today I'm going to fix the upload."));
    expect(screen.queryByText("Finish the sentence")).not.toBeInTheDocument();
  });

  it("keeps the microphone off while the learner types", async () => {
    await startAndListen();
    mic.pause.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Type instead" }));
    expect(mic.pause).toHaveBeenCalled();
  });

  it("ends the session on the server when the learner leaves mid-session", async () => {
    await startAndListen();
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Paused" })).toBeNull();
    // Unmounting the screen (e.g. the back button) closes the session.
    cleanupApp();
    expect(api.endSession).toHaveBeenCalledWith("s1", expect.objectContaining({ pausesMs: expect.any(Array) }));
  });

  it("keeps the mission's conversation paused when the learner leaves mid-session", async () => {
    await startAndListen({ path: "/session/daily?mission=m1" });
    cleanupApp();
    expect(api.endSession).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("voxa.liveSession") ?? "{}")).toMatchObject({ sessionId: "s1", missionId: "m1" });
  });

  it("lets the learner send early or stop the tutor by tapping the ball", async () => {
    await startAndListen();
    act(() => micHandlers.onSpeechStart());
    await userEvent.click(screen.getByRole("button", { name: "Send now" }));
    expect(mic.sendNow).toHaveBeenCalled();
  });

  it("sends an unknown mode back to Today", async () => {
    const router = renderSession("/session/karaoke");
    expect(router.state.location.pathname).toBe("/");
  });
});

async function endFromPause() {
  await userEvent.click(screen.getByRole("button", { name: "Pause" }));
  await userEvent.click(screen.getByRole("button", { name: "End session" }));
}

describe("XP", () => {
  it("shows the XP of a self-correction the moment it happens", async () => {
    await startAndListen();
    act(() => socketHandlers.onTutor({ kind: "hint", message: "Almost. Think about the past.", selfCorrected: false, mistake: "I finish" }));
    act(() => socketHandlers.onTutor({ kind: "reply", message: "Right! And then?", selfCorrected: true }));
    expect((await screen.findByText("Fixed it yourself")).closest("[aria-live]")).toHaveTextContent("+5 XPFixed it yourself");
  });

  it("counts the session's XP on the summary and says when it met the daily goal", async () => {
    api.endSession.mockResolvedValue(
      summaryWith([], {
        xp: {
          awards: [
            { reason: "practice_minute", count: 12, points: 12 },
            { reason: "self_corrected", count: 1, points: 5 },
          ],
          total: 17,
        },
      }),
    );
    await startAndListen();
    api.todayProgress.mockResolvedValue(todayWith(42));
    await endFromPause();

    const xp = await screen.findByRole("region", { name: "XP this session" });
    expect(xp).toHaveTextContent("12 minutes talking+12");
    expect(xp).toHaveTextContent("Fixed 1 mistake yourself+5");
    expect(await within(xp).findByText("Daily goal met")).toBeInTheDocument();
    expect(within(xp).getByRole("img", { name: "42 of 40 XP today" })).toBeInTheDocument();
  });
});

describe("session summary", () => {
  it("shows the signals, what to keep, then saves", async () => {
    api.endSession.mockResolvedValue(
      summaryWith(
        [
          mistake("serious", true, "Yesterday I finish it", "Yesterday I finished it"),
          mistake("serious", false, "I'm waiting the keys", "I'm waiting for the keys"),
          mistake("minor", false, "on the next sprint", "in the next sprint"),
        ],
        {
          signals: {
            selfCorrectionRate: 0.5,
            mistakesPer100Words: 4.25,
            averagePauseMs: 1840,
            wordsPerMinute: 92,
            longPausesPerMinute: 1.25,
          },
        },
      ),
    );
    await startAndListen();
    await endFromPause();

    const signals = await screen.findByLabelText("Fluency signals");
    expect(signals).toHaveTextContent("Pace92words a minute · 1.3 long pauses a minute");
    expect(signals).toHaveTextContent("Fixed with a hint1 of 2after a hint");
    expect(signals).toHaveTextContent("Pause before answering1.8 saverage");
    expect(signals).toHaveTextContent("Mistakes4.3per 100 words");

    // Mistakes from an older server have no pattern: nothing to try, they are all small details.
    await userEvent.click(screen.getByRole("button", { name: "See what to keep" }));
    expect(screen.getByRole("button", { name: "+ 3 small details, saved for later" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Session saved" })).toBeInTheDocument();
    expect(screen.getByText("3 mistakes saved to your mistake bank.")).toBeInTheDocument();
    expect(screen.getByText("Every mistake today is something you'll say better next time.")).toBeInTheDocument();
  });

  const past = { key: "past_simple", name: "Past for finished actions", rule: "Ação que já terminou: verbo no passado." };
  const waitFor = { key: "wait_for", name: "“Wait for” something", rule: "Esperar algo: wait for." };
  const patterned = [
    { ...mistake("serious", true, "Yesterday I finish it", "Yesterday I finished it"), category: "verb_tense", pattern: past, patternId: "p1" },
    { ...mistake("serious", false, "I'm waiting the keys", "I'm waiting for the keys"), category: "articles_prepositions", pattern: waitFor, patternId: "p2" },
    { ...mistake("minor", false, "on the next sprint", "in the next sprint"), category: "articles_prepositions", patternId: "p3", pattern: { key: "in_sprint", name: "“In” a sprint", rule: "In + sprint." } },
    { ...mistake("minor", false, "in the sprint review", "at the sprint review"), category: "articles_prepositions", patternId: "p3", pattern: { key: "in_sprint", name: "“In” a sprint", rule: "In + sprint." } },
    { ...mistake("minor", false, "prazo", "deadline"), category: "new_word" },
  ];
  const takeaways = [
    { patternId: "p1", category: "verb_tense", name: past.name, rule: past.rule, said: "Yesterday I finish it" },
    { patternId: "p2", category: "articles_prepositions", name: waitFor.name, rule: waitFor.rule, said: "I'm waiting the keys" },
  ];

  it("asks to take at most three patterns, without the correct form, and keeps the rest one tap away", async () => {
    api.endSession.mockResolvedValue(summaryWith(patterned, { takeaways }));
    await startAndListen();
    await endFromPause();
    await userEvent.click(await screen.findByRole("button", { name: "See what to keep" }));

    expect(screen.getByRole("heading", { name: "Take these with you" })).toBeInTheDocument();
    const cards = within(screen.getByRole("list", { name: "Patterns to take with you" })).getAllByRole("listitem");
    expect(cards.map((c) => c.textContent)).toEqual([
      "Verb tensePast for finished actionsYou said: “Yesterday I finish it”",
      "Articles and prepositions“Wait for” somethingYou said: “I'm waiting the keys”",
    ]);
    expect(screen.queryByText(/I'm waiting for the keys/)).toBeNull();
    expect(screen.getByRole("region", { name: "New words" })).toHaveTextContent("prazo → deadline");

    await userEvent.click(screen.getByRole("button", { name: "+ 2 small details, saved for later" }));
    const sheet = screen.getByRole("dialog", { name: "Small details" });
    expect(within(sheet).getByRole("listitem")).toHaveTextContent("Articles and prepositions · “In” a sprint2");
  });

  it("tries each pattern from memory, then says when each one comes back", async () => {
    const now = new Date();
    const inDays = (days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12).toISOString();
    api.endSession.mockResolvedValue(summaryWith(patterned, { takeaways }));
    api.reviewCard
      .mockResolvedValueOnce({ cardId: "c1", item: { subject: { kind: "pattern", id: "p1" }, language: "en", name: past.name }, cue: "Eu terminei ontem." })
      .mockResolvedValueOnce({ cardId: "c2", item: { subject: { kind: "pattern", id: "p2" }, language: "en", name: waitFor.name }, cue: "Estou esperando as chaves." });
    api.answerReview
      .mockResolvedValueOnce({ recalled: true, answer: "I finished it yesterday.", rule: past.rule, nextDueAt: inDays(3), xp: 1 })
      .mockResolvedValueOnce({ recalled: false, answer: "I'm waiting for the keys.", rule: waitFor.rule, nextDueAt: inDays(1), xp: 1 });
    await startAndListen();
    await endFromPause();
    await userEvent.click(await screen.findByRole("button", { name: "See what to keep" }));
    await userEvent.click(screen.getByRole("button", { name: "Try them · 1 min" }));

    expect(await screen.findByText("“Eu terminei ontem.”")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    // Answered aloud: the recording is transcribed, then checked.
    expect(await screen.findByText("Say it aloud")).toBeInTheDocument();
    api.transcribe.mockResolvedValueOnce("Yesterday I finished it");
    const wav = new ArrayBuffer(16);
    act(() => micHandlers.onTurn(wav));
    expect(api.transcribe).toHaveBeenCalledWith(wav, "en");
    expect(api.reviewCard).toHaveBeenCalledWith({ kind: "pattern", id: "p1" });
    expect(await screen.findByRole("status")).toHaveTextContent("That's it");
    expect(api.answerReview).toHaveBeenCalledWith("c1", "Yesterday I finished it", null);
    expect(screen.getByRole("region", { name: "You said" })).toHaveTextContent(`Yesterday I finished it${past.name}. ${past.rule}`);
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    await userEvent.click(await screen.findByRole("button", { name: "I don't know, show me" }));
    expect(api.answerReview).toHaveBeenLastCalledWith("c2", null, null);
    expect(await screen.findByText("Almost")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "One way to say it" })).toHaveTextContent("I'm waiting for the keys.");
    expect(screen.getByText("Say it once more · this one comes back tomorrow")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));

    expect(screen.getByRole("heading", { name: "Saved for your review" })).toBeInTheDocument();
    expect(screen.getByText("+2 XP toward today's goal")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      `${past.name}in 3 days`,
      `${waitFor.name}tomorrow`,
    ]);
  });

  it("says when an answer can't be checked, and keeps the question", async () => {
    api.endSession.mockResolvedValue(summaryWith(patterned, { takeaways: takeaways.slice(0, 1) }));
    api.reviewCard.mockResolvedValue({ cardId: "c1", item: { subject: { kind: "pattern", id: "p1" }, language: "en", name: past.name }, cue: "Eu terminei ontem." });
    api.answerReview.mockRejectedValueOnce(new Error("offline"));
    await startAndListen();
    await endFromPause();
    await userEvent.click(await screen.findByRole("button", { name: "See what to keep" }));
    await userEvent.click(screen.getByRole("button", { name: "Try them · 1 min" }));
    await userEvent.click(await screen.findByRole("button", { name: "I don't know, show me" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't check that answer. Try again.");
    expect(screen.getByText("“Eu terminei ontem.”")).toBeInTheDocument();
  });

  it("earns no review XP when the learner leaves the patterns for later", async () => {
    api.endSession.mockResolvedValue(summaryWith(patterned, { takeaways }));
    await startAndListen();
    await endFromPause();
    await userEvent.click(await screen.findByRole("button", { name: "See what to keep" }));
    await userEvent.click(screen.getByRole("button", { name: "Later" }));

    expect(screen.getByRole("heading", { name: "Session saved" })).toBeInTheDocument();
    expect(screen.queryByText(/XP toward today's goal/)).not.toBeInTheDocument();
  });

  it("asks again when nothing was heard, and lets the learner type instead", async () => {
    api.endSession.mockResolvedValue(summaryWith(patterned, { takeaways: takeaways.slice(0, 1) }));
    api.reviewCard.mockResolvedValue({ cardId: "c1", item: { subject: { kind: "pattern", id: "p1" }, language: "en", name: past.name }, cue: "Eu terminei ontem." });
    api.transcribe.mockResolvedValueOnce("");
    api.answerReview.mockResolvedValue({ recalled: true, answer: "I finished it yesterday.", rule: past.rule, nextDueAt: new Date().toISOString(), xp: 1 });
    await startAndListen();
    await endFromPause();
    await userEvent.click(await screen.findByRole("button", { name: "See what to keep" }));
    await userEvent.click(screen.getByRole("button", { name: "Try them · 1 min" }));
    await screen.findByText("Say it aloud");

    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    expect(await screen.findByRole("alert")).toHaveTextContent("I didn't catch that. Say it again.");
    expect(api.answerReview).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Type instead" }));
    await userEvent.type(screen.getByLabelText("Your answer"), "I finished it yesterday{Enter}");
    expect(api.answerReview).toHaveBeenCalledWith("c1", "I finished it yesterday", null);
  });

  it("offers to try again when a cue can't be loaded", async () => {
    api.endSession.mockResolvedValue(summaryWith(patterned, { takeaways: takeaways.slice(0, 1) }));
    api.reviewCard
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ cardId: "c1", item: { subject: { kind: "pattern", id: "p1" }, language: "en", name: past.name }, cue: "Eu terminei ontem." });
    await startAndListen();
    await endFromPause();
    await userEvent.click(await screen.findByRole("button", { name: "See what to keep" }));
    await userEvent.click(screen.getByRole("button", { name: "Try them · 1 min" }));

    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("“Eu terminei ontem.”")).toBeInTheDocument();
  });

  it("goes straight to saving without mistakes", async () => {
    await startAndListen();
    await endFromPause();

    expect(await screen.findByLabelText("Fluency signals")).toHaveTextContent("Fixed with a hint–no hints needed");
    expect(screen.getByLabelText("Fluency signals")).toHaveTextContent("Pace–not measured");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Your session is saved.")).toBeInTheDocument();
    expect(screen.queryByText(/Every mistake today/)).toBeNull();
  });

  it("as the mission's conversation, shows the takeaways once with no try, then goes back to the mission", async () => {
    api.endSession.mockResolvedValue(summaryWith(patterned, { takeaways }));
    await startAndListen({ path: "/session/daily?mission=m1" });
    expect(api.startSession).toHaveBeenCalledWith("daily", undefined, "m1");
    expect(JSON.parse(localStorage.getItem("voxa.liveSession") ?? "{}")).toMatchObject({ missionId: "m1" });
    await endFromPause();

    await userEvent.click(await screen.findByRole("button", { name: "See what to keep" }));
    expect(screen.queryByRole("button", { name: "Try them · 1 min" })).toBeNull();
    // Step 5 reviews them.
    expect(JSON.parse(localStorage.getItem("voxa.missionTakeaways") ?? "{}")).toEqual({ missionId: "m1", patternIds: takeaways.map((t) => t.patternId) });
    await userEvent.click(screen.getByRole("button", { name: "Continue mission" }));
    expect(api.missionToday).toHaveBeenCalled();
  });

  it("says what went better than in the last sessions, and never lists what went worse", async () => {
    api.endSession.mockResolvedValue(
      summaryWith([], {
        comparison: {
          sessions: 3,
          signals: [
            { name: "unaidedShare", current: 0.8, baseline: 0.5, trend: "better" },
            { name: "wordsPerMinute", current: 90, baseline: 70, trend: "better" },
            { name: "averagePauseMs", current: 2500, baseline: 1500, trend: "worse" },
          ],
        },
      }),
    );
    await startAndListen();
    await endFromPause();
    const line = await screen.findByRole("region", { name: "Compared with your last sessions" });
    expect(line).toHaveTextContent("Compared with your last 3 sessions");
    expect(line).toHaveTextContent("More answers without help and a faster pace.");
    expect(line).not.toHaveTextContent(/pause/i);
  });

  it("calls a session with nothing better steady", async () => {
    api.endSession.mockResolvedValue(
      summaryWith([], {
        comparison: { sessions: 1, signals: [{ name: "wordsPerMinute", current: 70, baseline: 72, trend: "steady" }] },
      }),
    );
    await startAndListen();
    await endFromPause();
    expect(await screen.findByRole("region", { name: "Compared with your last sessions" })).toHaveTextContent(
      "Compared with your last sessionMuch like your last session.",
    );
  });

  it("says it in Portuguese too", async () => {
    api.endSession.mockResolvedValue(
      summaryWith([], {
        comparison: {
          sessions: 3,
          signals: [
            { name: "unaidedShare", current: 0.8, baseline: 0.5, trend: "better" },
            { name: "wordsPerMinute", current: 90, baseline: 70, trend: "better" },
          ],
        },
      }),
    );
    await startAndListen({ withLocale: true });
    await userEvent.click(screen.getByRole("button", { name: "Pausar" }));
    await userEvent.click(screen.getByRole("button", { name: "Encerrar sessão" }));
    const line = await screen.findByRole("region", { name: "Comparado com suas últimas sessões" });
    expect(line).toHaveTextContent("Comparado com suas últimas 3 sessões");
    expect(line).toHaveTextContent("Mais respostas sem ajuda e ritmo mais rápido.");
  });

  it("shows no comparison without earlier sessions", async () => {
    api.endSession.mockResolvedValue(summaryWith([], { comparison: null }));
    await startAndListen();
    await endFromPause();
    await screen.findByLabelText("Fluency signals");
    expect(screen.queryByRole("region", { name: "Compared with your last sessions" })).toBeNull();
  });

  it("shows only the saved step when the summary can't be loaded", async () => {
    api.endSession.mockRejectedValue(new Error("offline"));
    await startAndListen();
    await endFromPause();
    expect(await screen.findByRole("heading", { name: "Session saved" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Fluency signals")).toBeNull();
  });
});

describe("fluency timing", () => {
  it("ends turns after the pause the learner chose, and does not count that pause as speech", async () => {
    savePauseMs(4000);
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    renderSession();
    await opened();
    expect(deps.openMicrophone).toHaveBeenCalledWith(expect.anything(), { endSilenceMs: 4000, releaseWhilePaused: true });
    act(() => socketHandlers.onOpen());
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    act(() => socketHandlers.onDone());
    now.mockReturnValue(3000);
    await act(async () => finishPlayback());

    now.mockReturnValue(4500);
    act(() => micHandlers.onSpeechStart());
    // 4 s of speech plus the chosen 4 s of silence.
    now.mockReturnValue(12_500);
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("I fixed it"));

    await endFromPause();
    await screen.findByRole("heading", { name: "Session done" });
    expect(api.endSession).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ tutorSpeechMs: 3000, pausesMs: [1500], learnerSpeechMs: 4000 }),
    );
    now.mockRestore();
  });

  it("saves the timing so far after each turn, and goes on when that fails", async () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    await startAndListen();
    now.mockReturnValue(1000);
    act(() => micHandlers.onSpeechStart());
    now.mockReturnValue(4000);
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("I fixed it"));
    api.saveTiming.mockRejectedValueOnce(new Error("offline"));
    act(() => socketHandlers.onTutor({ kind: "reply", message: "Nice.", selfCorrected: false }));
    act(() => socketHandlers.onDone());

    expect(api.saveTiming).toHaveBeenLastCalledWith("s1", expect.objectContaining({ spokenWords: 3 }));
    now.mockRestore();
  });

  it("saves the timing every 5 minutes while the session is open, paused too", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await startAndListen();
      api.saveTiming.mockClear();
      await act(async () => vi.advanceTimersByTime(5 * 60 * 1000));
      expect(api.saveTiming).toHaveBeenCalledTimes(1);
      await userEvent.click(screen.getByRole("button", { name: "Pause" }));
      await act(async () => vi.advanceTimersByTime(5 * 60 * 1000));
      expect(api.saveTiming).toHaveBeenCalledTimes(2);
      expect(api.saveTiming).toHaveBeenLastCalledWith("s1", expect.objectContaining({ pausesMs: expect.any(Array) }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts all the time as speech when the learner taps to send", async () => {
    savePauseMs(4000);
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    await startAndListen();
    now.mockReturnValue(1000);
    act(() => micHandlers.onSpeechStart());
    mic.sendNow.mockReturnValueOnce(true);
    now.mockReturnValue(4000);
    await userEvent.click(screen.getByRole("button", { name: "Send now" }));
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("I fixed it"));

    await endFromPause();
    await screen.findByRole("heading", { name: "Session done" });
    expect(api.endSession).toHaveBeenCalledWith("s1", expect.objectContaining({ learnerSpeechMs: 3000 }));
    now.mockRestore();
  });

  it("sends the pause before answering, the speaking time, the long pauses and the spoken words", async () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    renderSession();
    await opened();
    act(() => socketHandlers.onOpen());
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    act(() => socketHandlers.onDone());
    now.mockReturnValue(3000);
    await act(async () => finishPlayback());

    now.mockReturnValue(4500);
    act(() => micHandlers.onSpeechStart());
    // 4 s of speech plus the end-of-turn silence (2.5 s), which is not speech.
    now.mockReturnValue(11_000);
    act(() => micHandlers.onTurn(new ArrayBuffer(16), { pausesMs: [1400, 600] }));
    act(() => socketHandlers.onTranscript("I fixed the login bug"));

    await endFromPause();
    await screen.findByRole("heading", { name: "Session done" });
    expect(api.endSession).toHaveBeenCalledWith("s1", {
      tutorSpeechMs: 3000,
      pausesMs: [1500],
      learnerSpeechMs: 4000,
      longPausesMs: [1400],
      spokenWords: 5,
    });
    now.mockRestore();
  });

  it("counts no pause before answering when the learner paused the tutor mid-line", async () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    renderSession();
    await opened();
    act(() => socketHandlers.onOpen());
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    act(() => socketHandlers.onDone());
    speaker.stop.mockImplementation(() => finishPlayback());
    now.mockReturnValue(1000);
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    now.mockReturnValue(120_000);
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    now.mockReturnValue(121_000);
    act(() => micHandlers.onSpeechStart());
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    await screen.findByRole("heading", { name: "Session done" });
    expect(api.endSession).toHaveBeenCalledWith("s1", expect.objectContaining({ pausesMs: [] }));
    now.mockRestore();
  });
});

describe("a safe place to speak", () => {
  it("shows the tutor's help in the learner's language as text, without speaking it", async () => {
    await startAndListen();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("The prazo is Friday"));
    act(() =>
      socketHandlers.onTutor({
        kind: "reply",
        message: "In English we say deadline. When is it?",
        selfCorrected: false,
        support: "“Prazo” em inglês é “deadline”.",
      }),
    );
    expect(screen.getByRole("note", { name: "Help" })).toHaveTextContent("“Prazo” em inglês é “deadline”.");
    expect(screen.queryByText("In English we say deadline. When is it?")).not.toBeInTheDocument();
  });

  it("reminds the learner that Portuguese is fine when they are stuck", async () => {
    await startAndListen();
    expect(screen.getByText("Just talk. Stuck on a word? Say it in Portuguese.")).toBeInTheDocument();
  });

  it("speaks to the learner in Portuguese when the interface is in Portuguese", async () => {
    await startAndListen({ withLocale: true });
    expect(await screen.findByText("Sua vez")).toBeInTheDocument();
    expect(screen.getByText("É só falar. Travou numa palavra? Diga em português.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Digitar em vez de falar" })).toBeInTheDocument();
    expect(screen.getByText("Daily stand-up")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Pausar" }));
    expect(screen.getByRole("dialog", { name: "Sessão pausada" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
  });

  it("marks the conversation text as English for screen readers", async () => {
    await startAndListen({ withLocale: true });
    await userEvent.click(screen.getByRole("button", { name: "Ver o que o tutor disse" }));
    expect(screen.getByText("Morning! What did you work on yesterday?")).toHaveAttribute("lang", "en");
  });
});

describe("when the session can't start", () => {
  it("says the tutor didn't answer when the session can't start for that, and how to check it", async () => {
    api.startSession.mockRejectedValueOnce(new ApiError("tutor_unavailable", "The tutor is not available right now.", 502));
    renderSession();
    const alert = await screen.findByRole("alert", { name: "The tutor didn't answer" });
    expect(within(alert).getByText("docker compose logs api")).toBeInTheDocument();
  });

  it("tells how to start the server when the session can't start for another reason", async () => {
    api.startSession.mockRejectedValueOnce(new ApiError("offline", "Can't reach the Voxa API."));
    renderSession();
    const alert = await screen.findByRole("alert", { name: "The session didn't start" });
    expect(within(alert).getByText("docker compose up")).toBeInTheDocument();
  });
});

describe("after a reload", () => {
  const savedDaily = {
    sessionId: "s1",
    mode: "daily",
    elapsedSeconds: 65,
    timing: { learnerSpeechMs: 4000, tutorSpeechMs: 6000, pausesMs: [800], longPausesMs: [], spokenWords: 10 },
    savedAt: Date.now(),
  };
  const resumed = {
    sessionId: "s1",
    mode: "daily",
    language: "en",
    startedAt: "2026-11-07T10:00:00.000Z",
    turns: [
      { role: "assistant", content: "Morning! What did you work on yesterday?" },
      { role: "user", content: "I goed to the meeting" },
      { role: "assistant", content: "When did it happen?" },
    ],
    goals: ["yesterday", "today", "blockers"],
    coveredGoals: ["yesterday"],
    hint: { hintsGiven: 1, revealed: false, mistake: "I goed" },
  };
  const saved = () => JSON.parse(localStorage.getItem("voxa.liveSession") ?? "null");

  it("remembers the live session while it runs and forgets it once it ends", async () => {
    await startAndListen();
    expect(saved()).toMatchObject({ sessionId: "s1", mode: "daily" });
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    await screen.findByRole("heading", { name: "Session done" });
    expect(saved()).toBeNull();
  });

  it("comes back paused in the same session, then the tutor says its last line again", async () => {
    localStorage.setItem("voxa.liveSession", JSON.stringify(savedDaily));
    api.resumeSession.mockResolvedValue(resumed);
    renderSession();

    const sheet = await screen.findByRole("dialog", { name: "Paused" });
    expect(sheet).toHaveTextContent("1:05");
    expect(api.resumeSession).toHaveBeenCalledWith("s1");
    // The server counts it as active again.
    expect(api.saveTiming).toHaveBeenCalledWith("s1", expect.objectContaining({ learnerSpeechMs: expect.any(Number) }));
    expect(api.startSession).not.toHaveBeenCalled();
    expect(deps.openVoiceSocket).not.toHaveBeenCalled();
    // The hint the learner was working on is still there.
    expect(screen.getByText("“I goed”")).toBeInTheDocument();
    expect(screen.getByText("When did it happen?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(deps.openVoiceSocket).toHaveBeenCalledWith("ws://api/api/sessions/s1/voice", expect.anything());
    act(() => socketHandlers.onOpen());
    expect(socket.speakLast).toHaveBeenCalledTimes(1);
    expect(mic.resume).not.toHaveBeenCalled();

    // The timing measured before the reload counts in the summary.
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(api.endSession).toHaveBeenCalledWith("s1", expect.objectContaining({ learnerSpeechMs: 4000, tutorSpeechMs: 6000 }));
  });

  it("repeats the last line from the pause sheet right after a reload", async () => {
    localStorage.setItem("voxa.liveSession", JSON.stringify(savedDaily));
    api.resumeSession.mockResolvedValue(resumed);
    renderSession();
    await screen.findByRole("dialog", { name: "Paused" });

    await userEvent.click(screen.getByRole("button", { name: "Repeat the last question" }));
    expect(deps.openVoiceSocket).toHaveBeenCalledTimes(1);
    act(() => socketHandlers.onOpen());
    expect(socket.speakLast).toHaveBeenCalled();
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    expect(speaker.play).toHaveBeenCalled();
  });

  it("says the tutor didn't answer when a saved session can't resume for that", async () => {
    localStorage.setItem("voxa.liveSession", JSON.stringify(savedDaily));
    api.resumeSession.mockRejectedValueOnce(new ApiError("tutor_unavailable", "The tutor is not available right now.", 502));
    renderSession();
    expect(await screen.findByRole("alert", { name: "The tutor didn't answer" })).toBeInTheDocument();
    expect(api.startSession).not.toHaveBeenCalled();
  });

  it("keeps the saved session when the API can't be reached, and picks it up on Try again", async () => {
    localStorage.setItem("voxa.liveSession", JSON.stringify(savedDaily));
    api.resumeSession.mockRejectedValueOnce(new ApiError("offline", "Can't reach the Voxa API.")).mockResolvedValue(resumed);
    renderSession();
    await screen.findByRole("alert");
    expect(api.startSession).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("dialog", { name: "Paused" })).toBeInTheDocument();
    expect(api.startSession).not.toHaveBeenCalled();
  });

  it.each([new ApiError("invalid", "Bad id.", 400), new Error("boom")])("starts a new session when the saved one can't be used (%s)", async (error) => {
    localStorage.setItem("voxa.liveSession", JSON.stringify(savedDaily));
    api.resumeSession.mockRejectedValue(error);
    await startAndListen();
    expect(api.startSession).toHaveBeenCalledWith("daily", undefined, undefined);
  });

  it("ends a session left more than 2 hours ago and starts a new one", async () => {
    localStorage.setItem("voxa.liveSession", JSON.stringify({ ...savedDaily, sessionId: "old", savedAt: Date.now() - 3 * 60 * 60_000 }));
    await startAndListen();
    expect(api.resumeSession).not.toHaveBeenCalled();
    expect(api.endSession).toHaveBeenCalledWith("old", savedDaily.timing);
  });

  it("starts a new session when the saved one has ended", async () => {
    localStorage.setItem("voxa.liveSession", JSON.stringify(savedDaily));
    api.resumeSession.mockRejectedValue(new ApiError("ended", "This session has ended.", 409));
    await startAndListen();
    expect(api.startSession).toHaveBeenCalledWith("daily", undefined, undefined);
  });

  it("closes a saved session of another meeting type and starts the one asked for", async () => {
    localStorage.setItem("voxa.liveSession", JSON.stringify({ ...savedDaily, sessionId: "old", mode: "review" }));
    await startAndListen();
    expect(api.resumeSession).not.toHaveBeenCalled();
    expect(api.endSession).toHaveBeenCalledWith("old", savedDaily.timing);
    expect(api.startSession).toHaveBeenCalledWith("daily", undefined, undefined);
  });
});


describe("placement interview", () => {
  it("ends without a result and points to Progress", async () => {
    api.startSession.mockResolvedValue({ sessionId: "s1", mode: "placement", language: "en", message: "Hi! What do you do?", goals: ["warm_up", "routine"] });
    api.endSession.mockResolvedValue(
      summaryWith([mistake("minor", false, "I work in app for translate", "I work on a translation app")], {
        mode: "placement",
        level: { language: "en", level: "A2", source: "placement", evidence: ["I work in app for translate"], assessedAt: "2026-11-07T10:00:00Z" },
      }),
    );
    renderSession("/session/placement");
    await opened();
    act(() => socketHandlers.onOpen());
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    act(() => socketHandlers.onDone());
    await act(async () => finishPlayback());
    // The interview's tasks are not shown as goals to tick off, only how far the chat has come.
    expect(screen.queryByText("Warm up")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Part 1 of 2" })).toBeInTheDocument();
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));
    act(() => socketHandlers.onTranscript("I am developer."));
    act(() => socketHandlers.onTutor({ kind: "reply", message: "Nice. What do you do every day?", selfCorrected: false, coveredGoals: ["warm_up"] }));
    expect(screen.getByRole("img", { name: "Part 2 of 2" })).toBeInTheDocument();

    await endFromPause();
    // No result here: the level lives in Progress.
    expect(await screen.findByRole("heading", { name: "Thanks for the chat" })).toBeInTheDocument();
    expect(screen.queryByText(/A2/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See it in Progress" })).toHaveAttribute("href", "/progress/level");
    expect(screen.getByRole("link", { name: "Start my first session" })).toHaveAttribute("href", "/");
    // Slips noted during the interview are not presented as mistakes.
    expect(screen.queryByText(/mistake/i)).not.toBeInTheDocument();
  });
});
