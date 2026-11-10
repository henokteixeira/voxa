import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import { type VoiceDeps, VoiceDepsContext } from "@/features/session/voice-deps";
import type { ApiClient, CheckInOverview } from "@/lib/api";
import type { MicrophoneHandlers } from "@/lib/voice/microphone";
import { CheckInPage } from "./check-in-page";

const overview = (due: boolean): CheckInOverview => ({
  task: "present_project",
  limitMs: 120_000,
  dueAt: "2026-11-09T10:00:00Z",
  due,
  checkIns: [],
});
const pace = (id: string, recordedAt: string, wordsPerMinute: number, longPauses: number) => ({ id, recordedAt, wordsPerMinute, longPauses });

function renderCheckIn(api: Partial<ApiClient>) {
  let handlers: MicrophoneHandlers | null = null;
  const mic = { pause: vi.fn(), resume: vi.fn(), sendNow: vi.fn(() => false), unlock: vi.fn(), stop: vi.fn() };
  const speaker = { play: vi.fn().mockResolvedValue(undefined), stop: vi.fn(), unlock: vi.fn(), close: vi.fn() };
  const deps = {
    openMicrophone: vi.fn(async (h: MicrophoneHandlers) => {
      handlers = h;
      return mic;
    }),
    createSpeaker: () => speaker,
  } as unknown as VoiceDeps;
  const router = createMemoryRouter(
    [
      { path: "/check-in", element: <CheckInPage /> },
      { path: "/", element: <p>Today</p> },
    ],
    { initialEntries: ["/check-in"] },
  );
  render(
    <ApiProvider value={api as ApiClient}>
      <VoiceDepsContext.Provider value={deps}>
        <RouterProvider router={router} />
      </VoiceDepsContext.Provider>
    </ApiProvider>,
  );
  const speak = () => {
    handlers!.onAudio?.(new Float32Array(320), 16_000);
    handlers!.onSpeechStart();
    handlers!.onTurn(new ArrayBuffer(8), { pausesMs: [], trailingSilenceMs: 0 });
  };
  return { speak, speaker, router };
}

describe("Check-in", () => {
  it("records the task, compares it with the last check-in and plays both recordings", async () => {
    const recordCheckIn = vi.fn().mockResolvedValue({
      checkIn: { ...pace("c2", "2026-11-23T10:00:00Z", 81, 4), transcript: "My project…" },
      previous: pace("c1", "2026-11-09T10:00:00Z", 68, 9),
    });
    const checkInRecording = vi.fn(async (id: string) => new TextEncoder().encode(id).buffer);
    const { speak, speaker, router } = renderCheckIn({ checkIns: vi.fn().mockResolvedValue(overview(true)), recordCheckIn, checkInRecording });

    await userEvent.click(await screen.findByRole("button", { name: "Start · 2:00" }));
    speak();
    await userEvent.click(screen.getByRole("button", { name: "I'm done" }));

    expect(recordCheckIn).toHaveBeenCalledWith(expect.any(ArrayBuffer), expect.objectContaining({ pausesMs: [] }));
    expect(await screen.findByRole("heading", { name: "The time before, you said 68 words a minute. Today, 81." })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: "Long pauses 9 4" })).toBeInTheDocument();
    // The earlier check-in wasn't read for mistakes: no mistake rows to compare.
    expect(screen.queryByRole("row", { name: /^Mistakes per 100 words/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /^Linking words/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Hear .+, then today$/ }));
    expect(checkInRecording.mock.calls.map(([id]) => id)).toEqual(["c1", "c2"]);
    expect(speaker.play).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("link", { name: "Done" }));
    expect(router.state.location.pathname).toBe("/");
  });

  it("shows no linking-word row when one of the check-ins has no count", async () => {
    const recordCheckIn = vi.fn().mockResolvedValue({
      checkIn: { ...pace("c2", "2026-11-23T10:00:00Z", 81, 4), linkingWordsPer100: 3, transcript: "My project…" },
      previous: { ...pace("c1", "2026-11-09T10:00:00Z", 68, 9), linkingWordsPer100: null },
    });
    const { speak } = renderCheckIn({ checkIns: vi.fn().mockResolvedValue(overview(true)), recordCheckIn, checkInRecording: vi.fn() });
    await userEvent.click(await screen.findByRole("button", { name: "Start · 2:00" }));
    speak();
    await userEvent.click(screen.getByRole("button", { name: "I'm done" }));
    expect(await screen.findByRole("row", { name: "Long pauses 9 4" })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /^Linking words/ })).not.toBeInTheDocument();
  });

  it("compares mistakes per 100 words and Portuguese words when both check-ins have them", async () => {
    const read = (id: string, at: string, wpm: number, mistakes: number, words: number, linking: number | null) => ({
      ...pace(id, at, wpm, 4),
      mistakesPer100Words: mistakes,
      otherLanguageWords: words,
      linkingWordsPer100: linking,
    });
    const recordCheckIn = vi.fn().mockResolvedValue({
      checkIn: { ...read("c2", "2026-11-23T10:00:00Z", 81, 3.5, 2, 4.1), transcript: "My project…" },
      previous: read("c1", "2026-11-09T10:00:00Z", 68, 6.2, 2, 2.2),
    });
    const { speak } = renderCheckIn({ checkIns: vi.fn().mockResolvedValue(overview(true)), recordCheckIn, checkInRecording: vi.fn() });
    await userEvent.click(await screen.findByRole("button", { name: "Start · 2:00" }));
    speak();
    await userEvent.click(screen.getByRole("button", { name: "I'm done" }));

    expect(await screen.findByRole("row", { name: "Mistakes per 100 words 6.2 3.5" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: "Words in Portuguese 2 2" })).toBeInTheDocument();
    // More linking words is better: the new value gets the color.
    const linking = screen.getByRole("row", { name: "Linking words per 100 (because, but…) 2.2 4.1" });
    expect(within(linking).getByText("4.1")).toHaveClass("text-sage-ink");
  });

  it("asks again when nothing was said", async () => {
    const recordCheckIn = vi.fn();
    renderCheckIn({ checkIns: vi.fn().mockResolvedValue(overview(true)), recordCheckIn });
    await userEvent.click(await screen.findByRole("button", { name: "Start · 2:00" }));
    await userEvent.click(screen.getByRole("button", { name: "I'm done" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("I didn't hear anything.");
    expect(recordCheckIn).not.toHaveBeenCalled();
  });

  it("does not start before it is due", async () => {
    renderCheckIn({ checkIns: vi.fn().mockResolvedValue(overview(false)) });
    expect(await screen.findByRole("alert")).toHaveTextContent("The next check-in isn't due yet.");
    expect(screen.queryByRole("button", { name: "Start · 2:00" })).toBeNull();
  });
});
