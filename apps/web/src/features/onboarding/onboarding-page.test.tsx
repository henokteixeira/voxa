import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceDepsContext, type VoiceDeps } from "@/features/session/voice-deps";
import { type MicrophoneHandlers, MicrophoneUnavailableError } from "@/lib/voice/microphone";
import { NOT_HEARING_MS, OnboardingPage } from "./onboarding-page";

function renderOnboarding(openMicrophone: VoiceDeps["openMicrophone"]) {
  const router = createMemoryRouter(
    [
      { path: "/onboarding", element: <OnboardingPage /> },
      { path: "*", element: <p>elsewhere</p> },
    ],
    { initialEntries: ["/onboarding"] },
  );
  const deps = { openMicrophone, openVoiceSocket: vi.fn(), createSpeaker: vi.fn() } as unknown as VoiceDeps;
  render(
    <VoiceDepsContext.Provider value={deps}>
      <RouterProvider router={router} />
    </VoiceDepsContext.Provider>,
  );
  return router;
}

afterEach(() => localStorage.clear());

describe("OnboardingPage", () => {
  it("checks the microphone with one sentence, then leads to the level chat", async () => {
    let handlers: MicrophoneHandlers | undefined;
    const mic = { stop: vi.fn(), unlock: vi.fn(), pause: vi.fn(), resume: vi.fn(), sendNow: vi.fn() };
    const router = renderOnboarding(
      vi.fn(async (h: MicrophoneHandlers) => {
        handlers = h;
        return mic;
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(screen.getByRole("img", { name: "Step 1 of 2" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Turn on the microphone" }));
    expect(await screen.findByText("Listening")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();

    act(() => {
      handlers?.onSpeechStart();
      handlers?.onTurn(new ArrayBuffer(0));
    });
    expect(screen.getByText("We can hear you.")).toBeInTheDocument();
    expect(mic.stop).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("No hints and no corrections. The tutor only listens.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start the chat" }));
    expect(router.state.location.pathname).toBe("/session/placement");
    // Seen: coming back to Today without a level does not open the onboarding again.
    expect(localStorage.getItem("voxa.onboardingSeen")).toBe("1");
  });

  it("remembers Do it later, so Today stops opening the onboarding on its own", async () => {
    let handlers: MicrophoneHandlers | undefined;
    const mic = { stop: vi.fn(), unlock: vi.fn(), pause: vi.fn(), resume: vi.fn(), sendNow: vi.fn() };
    const router = renderOnboarding(
      vi.fn(async (h: MicrophoneHandlers) => {
        handlers = h;
        return mic;
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Get started" }));
    await userEvent.click(screen.getByRole("button", { name: "Turn on the microphone" }));
    await screen.findByText("Listening");
    act(() => {
      handlers?.onSpeechStart();
      handlers?.onTurn(new ArrayBuffer(0));
    });
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Do it later" }));
    expect(router.state.location.pathname).toBe("/");
    expect(localStorage.getItem("voxa.onboardingSeen")).toBe("1");
  });

  it("says why the microphone can't be used and lets the learner try again", async () => {
    const openMicrophone = vi.fn().mockRejectedValue(new MicrophoneUnavailableError("blocked"));
    renderOnboarding(openMicrophone);

    await userEvent.click(screen.getByRole("button", { name: "Get started" }));
    await userEvent.click(screen.getByRole("button", { name: "Turn on the microphone" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The browser is blocking the microphone.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(openMicrophone).toHaveBeenCalledTimes(2);
  });

  it("closes the microphone when the learner goes back, and checks again on return", async () => {
    const mic = { stop: vi.fn(), unlock: vi.fn(), pause: vi.fn(), resume: vi.fn(), sendNow: vi.fn() };
    renderOnboarding(vi.fn().mockResolvedValue(mic));
    await userEvent.click(screen.getByRole("button", { name: "Get started" }));
    await userEvent.click(screen.getByRole("button", { name: "Turn on the microphone" }));
    await screen.findByText("Listening");

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(mic.stop).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(screen.getByRole("button", { name: "Turn on the microphone" })).toBeInTheDocument();
  });

  it("offers to try again when nothing is heard for a while", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const mic = { stop: vi.fn(), unlock: vi.fn(), pause: vi.fn(), resume: vi.fn(), sendNow: vi.fn() };
      renderOnboarding(vi.fn().mockResolvedValue(mic));
      await user.click(screen.getByRole("button", { name: "Get started" }));
      await user.click(screen.getByRole("button", { name: "Turn on the microphone" }));
      expect(await screen.findByText("Listening")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
      act(() => vi.advanceTimersByTime(NOT_HEARING_MS));
      expect(screen.getByText(/Speak a bit louder/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
