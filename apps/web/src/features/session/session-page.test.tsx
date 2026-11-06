import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import { routes } from "@/app/router";
import type { ApiClient } from "@/lib/api";
import { type MicrophoneHandlers, MicrophoneUnavailableError } from "@/lib/voice/microphone";
import type { VoiceSocketHandlers } from "@/lib/voice/voice-socket";
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
  voiceUrl: (id: string) => `ws://api/api/sessions/${id}/voice`,
} as unknown as ApiClient & { [K in "health" | "startSession" | "endSession"]: ReturnType<typeof vi.fn> };

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

function renderSession(path = "/session/daily") {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  cleanupApp = render(
    <ApiProvider value={api}>
      <VoiceDepsContext.Provider value={deps}>
        <RouterProvider router={router} />
      </VoiceDepsContext.Provider>
    </ApiProvider>,
  ).unmount;
  return router;
}

/** Starts a session and plays the opening line through to the learner's turn. */
async function startAndListen() {
  renderSession();
  await screen.findByText("Morning! What did you work on yesterday?");
  act(() => socketHandlers.onOpen());
  act(() => socketHandlers.onSpeech(new ArrayBuffer(8)));
  act(() => socketHandlers.onDone());
  await act(async () => finishPlayback());
  expect(await screen.findByText("Your turn")).toBeInTheDocument();
}

beforeEach(() => {
  vi.clearAllMocks();
  api.health.mockResolvedValue({ status: "ok" });
  api.endSession.mockResolvedValue({ sessionId: "s1", mode: "daily", mistakes: [], selfCorrections: 0 });
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
    api.endSession.mockResolvedValue({ sessionId: "s1", mode: "daily", mistakes: [{}, {}], selfCorrections: 0 });
    await startAndListen();

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeInTheDocument();
    socket.speakLast.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Repeat the last question" }));
    expect(socket.speakLast).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(await screen.findByText("2 mistakes saved to your mistake bank.")).toBeInTheDocument();
    expect(api.endSession).toHaveBeenCalledWith("s1");
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
    expect(api.endSession).toHaveBeenCalledWith("s1");
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
    expect(router.state.location.pathname).toBe("/session/review");
  });
});
