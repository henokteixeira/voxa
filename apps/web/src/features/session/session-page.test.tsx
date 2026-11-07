import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import { routes } from "@/app/router";
import { ApiError, type ApiClient } from "@/lib/api";
import { type MicrophoneHandlers, MicrophoneUnavailableError } from "@/lib/voice/microphone";
import { savePauseMs } from "@/lib/voice/pause-setting";
import type { VoiceSocketHandlers } from "@/lib/voice/voice-socket";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { type VoiceDeps, VoiceDepsContext } from "./voice-deps";

let micHandlers: MicrophoneHandlers;
let socketHandlers: VoiceSocketHandlers;
const mic = { pause: vi.fn(), resume: vi.fn(), sendNow: vi.fn(), unlock: vi.fn(), stop: vi.fn() };
const socket = { sendTurn: vi.fn(), sendText: vi.fn(), speakLast: vi.fn(), close: vi.fn() };
const speaker = { play: vi.fn(), stop: vi.fn(), unlock: vi.fn(), close: vi.fn() };
let finishPlayback: () => void;

const api = {
  health: vi.fn(),
  startSession: vi.fn(),
  sendTurn: vi.fn(),
  endSession: vi.fn(),
  resumeSession: vi.fn(),
  rateConfidence: vi.fn(),
  fillerSpeech: vi.fn(),
  voiceUrl: (id: string) => `ws://api/api/sessions/${id}/voice`,
} as unknown as ApiClient & { [K in "health" | "startSession" | "endSession" | "resumeSession" | "rateConfidence" | "fillerSpeech"]: ReturnType<typeof vi.fn> };

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

let cleanupApp: () => void = () => {};

const noSignals = { selfCorrectionRate: null, mistakesPer100Words: null, averagePauseMs: null, speakingShare: null };
function summaryWith(mistakes: unknown[], extra: Record<string, unknown> = {}) {
  return {
    sessionId: "s1",
    mode: "daily",
    mistakes,
    selfCorrections: 0,
    signals: noSignals,
    confidence: { before: null, after: null },
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
async function startAndListen(options: { withLocale?: boolean } = {}) {
  renderSession("/session/daily", options);
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
  api.rateConfidence.mockResolvedValue(undefined);
  api.fillerSpeech.mockResolvedValue([]);
  api.startSession.mockResolvedValue({
    sessionId: "s1",
    mode: "daily",
    language: "en",
    message: "Morning! What did you work on yesterday?",
  });
  speaker.play.mockImplementation(() => new Promise<void>((resolve) => (finishPlayback = resolve)));
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
    await userEvent.click(screen.getByRole("button", { name: "Show what the tutor said" }));
    expect(screen.getByText("Nice. What's next?")).toHaveFocus();

    // Opening the transcript and closing it again keeps the line revealed.
    await userEvent.click(screen.getByRole("button", { name: "Show transcript" }));
    await userEvent.click(screen.getByRole("button", { name: "Hide transcript" }));
    expect(screen.getByText("Nice. What's next?")).toBeInTheDocument();
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

  it("keeps the whole conversation readable from the transcript button", async () => {
    await startAndListen();
    await userEvent.click(screen.getByRole("button", { name: "Show transcript" }));
    expect(screen.getByRole("list", { name: "Transcript" })).toHaveTextContent("Morning! What did you work on yesterday?");
  });

  it("starts the session, speaks the opening line, then listens", async () => {
    await startAndListen();
    expect(api.startSession).toHaveBeenCalledWith("daily");
    expect(deps.openVoiceSocket).toHaveBeenCalledWith("ws://api/api/sessions/s1/voice", expect.anything());
    expect(socket.speakLast).toHaveBeenCalled();
    expect(speaker.play).toHaveBeenCalled();
    expect(mic.resume).toHaveBeenCalled();
    expect(screen.getByText("Daily stand-up")).toBeInTheDocument();
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
    act(() => socketHandlers.onTutor({ kind: "hint", message: "When did this happen?", selfCorrected: false }));
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    act(() => socketHandlers.onDone());
    await act(async () => finishPlayback());

    const card = screen.getByRole("region", { name: "Hint 1 of 2" });
    expect(card).toHaveTextContent("“Yesterday I finish the upload screen”");
    expect(card).toHaveTextContent("When did this happen?");
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
      expect(speaker.play).toHaveBeenLastCalledWith(answer);
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
    const goals = screen.getByRole("list", { name: "Meeting goals" });
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

    expect(screen.getByRole("list", { name: "Meeting goals" })).toHaveTextContent("✓ Blockers");
    await userEvent.click(screen.getByRole("button", { name: "Keep going" }));
    expect(screen.queryByRole("region", { name: "Stop here?" })).not.toBeInTheDocument();

    act(() => socketHandlers.onTutor({ kind: "reply", message: "Anything else?", selfCorrected: false, checkIn: true }));
    await userEvent.click(screen.getByRole("button", { name: "Stop and see the summary" }));
    expect(await screen.findByRole("heading", { name: "Session done" })).toBeInTheDocument();
    expect(screen.getByText("Goals: 3 of 3")).toBeInTheDocument();
    expect(screen.getByText(/You got 1 of 2 right/)).toBeInTheDocument();
    expect(screen.getByText("Next time")).toBeInTheDocument();
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

  it("keeps the learner's turn when they start talking", async () => {
    await startAndListen();
    mic.resume.mockClear();
    act(() => micHandlers.onSpeechStart());
    expect(screen.getByText("Listening")).toBeInTheDocument();
    expect(mic.resume).not.toHaveBeenCalled();
  });

  it("lets the learner send early or stop the tutor by tapping the ball", async () => {
    await startAndListen();
    act(() => micHandlers.onSpeechStart());
    await userEvent.click(screen.getByRole("button", { name: "Send now" }));
    expect(mic.sendNow).toHaveBeenCalled();
  });

  it("sends Today's mode picker to the right session and rejects unknown modes", async () => {
    const router = renderSession("/session/karaoke");
    expect(router.state.location.pathname).toBe("/");
    await userEvent.click(await screen.findByRole("button", { name: "Other practice" }));
    await userEvent.click(screen.getByRole("link", { name: /Sprint review/ }));
    expect(router.state.location.pathname).toBe("/session/review/check-in");
    await act(() => router.navigate("/session/karaoke/check-in"));
    expect(router.state.location.pathname).toBe("/");
  });
});

async function endFromPause() {
  await userEvent.click(screen.getByRole("button", { name: "Pause" }));
  await userEvent.click(screen.getByRole("button", { name: "End session" }));
}

describe("confidence check-in", () => {
  it("asks before the session and stores the answer once the session exists", async () => {
    renderSession("/session/presentation/check-in");
    expect(
      screen.getByRole("heading", { name: "How confident do you feel about a real project presentation right now?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: "2" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await opened();
    expect(api.startSession).toHaveBeenCalledWith("presentation");
    expect(api.rateConfidence).toHaveBeenCalledWith("s1", "before", 2);
  });

  it("asks in Portuguese and says there is no wrong answer", async () => {
    renderSession("/session/presentation/check-in", { withLocale: true });
    expect(
      screen.getByRole("heading", { name: "Quanta confiança você tem agora para uma apresentação de projeto?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Não existe resposta errada/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pular" })).toBeInTheDocument();
  });

  it("can be skipped", async () => {
    renderSession("/session/daily/check-in");
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    await opened();
    expect(api.rateConfidence).not.toHaveBeenCalled();
  });
});

describe("session summary", () => {
  it("shows the signals, the mistakes, the check-out, then saves", async () => {
    api.endSession.mockResolvedValue(
      summaryWith(
        [
          mistake("serious", true, "Yesterday I finish it", "Yesterday I finished it"),
          mistake("serious", false, "I'm waiting the keys", "I'm waiting for the keys"),
          mistake("minor", false, "on the next sprint", "in the next sprint"),
        ],
        {
          signals: { selfCorrectionRate: 0.5, mistakesPer100Words: 4.25, averagePauseMs: 1840, speakingShare: 0.594 },
          confidence: { before: 3, after: null },
        },
      ),
    );
    await startAndListen();
    await endFromPause();

    const signals = await screen.findByLabelText("Fluency signals");
    expect(signals).toHaveTextContent("You spoke59%of the time");
    expect(signals).toHaveTextContent("Fixed yourself1 of 2after a hint");
    expect(signals).toHaveTextContent("Pause before answering1.8 saverage");
    expect(signals).toHaveTextContent("Mistakes4.3per 100 words");

    await userEvent.click(screen.getByRole("button", { name: "See your mistakes" }));
    expect(screen.getByText("3 mistakes · 1 fixed by you")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("span")?.textContent)).toEqual([
      "Fixed after a hint",
      "Learned with help",
      "Small mistake",
    ]);
    expect(items[1]).toHaveTextContent("I'm waiting for the keys");

    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "And now, how confident do you feel about a real daily?" })).toBeInTheDocument();
    expect(screen.getByText("The circled number is your answer from before (3).")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "4" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(api.rateConfidence).toHaveBeenCalledWith("s1", "after", 4);
    expect(screen.getByRole("heading", { name: "Session saved" })).toBeInTheDocument();
    expect(screen.getByText("3 mistakes saved to your mistake bank.")).toBeInTheDocument();
    expect(screen.getByText("Every mistake today is something you'll say better next time.")).toBeInTheDocument();
  });

  it("shows a word said in Portuguese as a new word, not as a mistake", async () => {
    api.endSession.mockResolvedValue(
      summaryWith([
        mistake("minor", false, "on the next sprint", "in the next sprint"),
        { ...mistake("minor", false, "prazo", "deadline"), category: "new_word" },
      ]),
    );
    await startAndListen();
    await endFromPause();
    await userEvent.click(await screen.findByRole("button", { name: "See your mistakes" }));

    expect(screen.getByText("1 mistake · 0 fixed by you · 1 new word")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items[1].querySelector("span")?.textContent).toBe("New word");
    expect(screen.getByText("prazo")).not.toHaveClass("line-through");
    expect(screen.getByText("deadline")).toHaveAttribute("lang", "en");
  });

  it("goes straight to the check-out without mistakes, and the check-out can be skipped", async () => {
    await startAndListen();
    await endFromPause();

    expect(await screen.findByLabelText("Fluency signals")).toHaveTextContent("Fixed yourself–no hints needed");
    expect(screen.getByLabelText("Fluency signals")).toHaveTextContent("You spoke–not measured");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(api.rateConfidence).not.toHaveBeenCalled();
    expect(screen.getByText("Your session is saved.")).toBeInTheDocument();
    expect(screen.queryByText(/Every mistake today/)).toBeNull();
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
    expect(deps.openMicrophone).toHaveBeenCalledWith(expect.anything(), { endSilenceMs: 4000 });
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

    await endFromPause();
    await screen.findByRole("heading", { name: "Session done" });
    expect(api.endSession).toHaveBeenCalledWith("s1", { tutorSpeechMs: 3000, pausesMs: [1500], learnerSpeechMs: 4000 });
    now.mockRestore();
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

    await endFromPause();
    await screen.findByRole("heading", { name: "Session done" });
    expect(api.endSession).toHaveBeenCalledWith("s1", expect.objectContaining({ learnerSpeechMs: 3000 }));
    now.mockRestore();
  });

  it("sends the pause before answering and the speaking time it measured", async () => {
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
    act(() => micHandlers.onTurn(new ArrayBuffer(16)));

    await endFromPause();
    await screen.findByRole("heading", { name: "Session done" });
    expect(api.endSession).toHaveBeenCalledWith("s1", { tutorSpeechMs: 3000, pausesMs: [1500], learnerSpeechMs: 4000 });
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

  it("stores the confidence from the check-in once the session exists", async () => {
    const router = createMemoryRouter(routes, {
      initialEntries: [{ pathname: "/session/daily", state: { confidenceBefore: 2 } }],
    });
    cleanupApp = render(
      <ApiProvider value={api}>
        <VoiceDepsContext.Provider value={deps}>
          <RouterProvider router={router} />
        </VoiceDepsContext.Provider>
      </ApiProvider>,
    ).unmount;
    await opened();
    expect(api.rateConfidence).toHaveBeenCalledWith("s1", "before", 2);
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

describe("after a reload", () => {
  const savedDaily = {
    sessionId: "s1",
    mode: "daily",
    elapsedSeconds: 65,
    timing: { learnerSpeechMs: 4000, tutorSpeechMs: 6000, pausesMs: [800] },
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
    hint: { hintsGiven: 1, revealed: false },
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
    expect(api.startSession).not.toHaveBeenCalled();
    expect(deps.openVoiceSocket).not.toHaveBeenCalled();
    // The hint the learner was working on is still there.
    expect(screen.getByText("“I goed to the meeting”")).toBeInTheDocument();
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
    expect(api.startSession).toHaveBeenCalledWith("daily");
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
    expect(api.startSession).toHaveBeenCalledWith("daily");
  });

  it("closes a saved session of another meeting type and starts the one asked for", async () => {
    localStorage.setItem("voxa.liveSession", JSON.stringify({ ...savedDaily, sessionId: "old", mode: "review" }));
    await startAndListen();
    expect(api.resumeSession).not.toHaveBeenCalled();
    expect(api.endSession).toHaveBeenCalledWith("old", savedDaily.timing);
    expect(api.startSession).toHaveBeenCalledWith("daily");
  });
});

