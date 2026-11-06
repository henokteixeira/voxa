import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import { routes } from "@/app/router";
import type { ApiClient } from "@/lib/api";
import { type MicrophoneHandlers, MicrophoneUnavailableError } from "@/lib/voice/microphone";
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
  rateConfidence: vi.fn(),
  voiceUrl: (id: string) => `ws://api/api/sessions/${id}/voice`,
} as unknown as ApiClient & { [K in "health" | "startSession" | "endSession" | "rateConfidence"]: ReturnType<typeof vi.fn> };

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

/** Starts a session and plays the opening line through to the learner's turn. */
async function startAndListen(options: { withLocale?: boolean } = {}) {
  renderSession("/session/daily", options);
  await screen.findByText("Morning! What did you work on yesterday?");
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
  api.startSession.mockResolvedValue({
    sessionId: "s1",
    mode: "daily",
    language: "en",
    message: "Morning! What did you work on yesterday?",
  });
  speaker.play.mockImplementation(() => new Promise<void>((resolve) => (finishPlayback = resolve)));
});

describe("live session", () => {
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
    await screen.findByText("Morning! What did you work on yesterday?");
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
    expect(screen.getByText("Hint · say it again")).toBeInTheDocument();
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
    await screen.findByText("Morning! What did you work on yesterday?");
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

  it("lets the learner send early or stop the tutor by tapping the ball", async () => {
    await startAndListen();
    act(() => micHandlers.onSpeechStart());
    await userEvent.click(screen.getByRole("button", { name: "Send now" }));
    expect(mic.sendNow).toHaveBeenCalled();
  });

  it("sends Today's mode picker to the right session and rejects unknown modes", async () => {
    const router = renderSession("/session/karaoke");
    expect(router.state.location.pathname).toBe("/");
    await userEvent.click(await screen.findByRole("link", { name: /Sprint review/ }));
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

    await screen.findByText("Morning! What did you work on yesterday?");
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
    await screen.findByText("Morning! What did you work on yesterday?");
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
  it("sends the pause before answering and the speaking time it measured", async () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    renderSession();
    await screen.findByText("Morning! What did you work on yesterday?");
    act(() => socketHandlers.onOpen());
    act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
    act(() => socketHandlers.onDone());
    now.mockReturnValue(3000);
    await act(async () => finishPlayback());

    now.mockReturnValue(4500);
    act(() => micHandlers.onSpeechStart());
    now.mockReturnValue(9700);
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
    await screen.findByText("Morning! What did you work on yesterday?");
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
    await screen.findByText("Morning! What did you work on yesterday?");
    expect(api.rateConfidence).toHaveBeenCalledWith("s1", "before", 2);
  });
});

describe("a safe place to speak", () => {
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
    expect(screen.getByText("Morning! What did you work on yesterday?")).toHaveAttribute("lang", "en");
  });
});
