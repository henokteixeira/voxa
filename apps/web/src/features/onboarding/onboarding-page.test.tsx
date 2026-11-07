import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { VoiceDepsContext, type VoiceDeps } from "@/features/session/voice-deps";
import { type MicrophoneHandlers, MicrophoneUnavailableError } from "@/lib/voice/microphone";
import { OnboardingPage } from "./onboarding-page";

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

  it("goes back a step", async () => {
    const router = renderOnboarding(vi.fn());
    await userEvent.click(screen.getByRole("button", { name: "Get started" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Get started" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/onboarding");
  });
});
