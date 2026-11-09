import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import { type VoiceDeps, VoiceDepsContext } from "@/features/session/voice-deps";
import type { ApiClient, FasterRoundsView } from "@/lib/api";
import { type MicrophoneHandlers, MicrophoneUnavailableError } from "@/lib/voice/microphone";
import { FasterRun } from "./faster-run";

const view = (nextRound: number | null, result: FasterRoundsView["result"] = null): FasterRoundsView => ({
  language: "en",
  rounds: [],
  nextRound,
  nextLimitMs: nextRound ? [120_000, 90_000, 60_000][nextRound - 1] : null,
  result,
});
const result = {
  rounds: [
    { round: 1, wordsPerMinute: 72, longPauses: 6 },
    { round: 2, wordsPerMinute: 84, longPauses: 4 },
    { round: 3, wordsPerMinute: 92, longPauses: 2 },
  ],
  paceChangePercent: 28,
  fewerLongPauses: true,
};

function renderRun(api: Partial<ApiClient>, microphone: "works" | "blocked" = "works") {
  let handlers: MicrophoneHandlers | null = null;
  const mic = { pause: vi.fn(), resume: vi.fn(), sendNow: vi.fn(() => false), unlock: vi.fn(), stop: vi.fn() };
  const deps = {
    openMicrophone: vi.fn(async (h: MicrophoneHandlers) => {
      if (microphone === "blocked") throw new MicrophoneUnavailableError("blocked");
      handlers = h;
      return mic;
    }),
  } as unknown as VoiceDeps;
  const onDone = vi.fn();
  render(
    <ApiProvider value={api as ApiClient}>
      <VoiceDepsContext.Provider value={deps}>
        <FasterRun sessionId="s1" onDone={onDone} />
      </VoiceDepsContext.Provider>
    </ApiProvider>,
  );
  const say = (pausesMs: number[]) => {
    handlers!.onSpeechStart();
    handlers!.onTurn(new ArrayBuffer(8), { pausesMs, trailingSilenceMs: 0 });
  };
  return { onDone, say };
}

describe("Say it faster", () => {
  it("tells a round, saves what was heard and shows how the pace changed", async () => {
    const recordFasterRound = vi.fn().mockResolvedValueOnce(view(2)).mockResolvedValueOnce(view(null, result));
    const transcribe = vi.fn().mockResolvedValue("I finished the login");
    const api = { fasterRounds: vi.fn().mockResolvedValue(view(1)), transcribe, recordFasterRound };
    const { onDone, say } = renderRun(api);

    await userEvent.click(await screen.findByRole("button", { name: "Start · 2:00" }));
    say([400, 1_500]);
    await userEvent.click(screen.getByRole("button", { name: "I'm done" }));
    expect(recordFasterRound).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ round: 1, transcript: "I finished the login", longPausesMs: [1_500] }),
    );
    expect(transcribe).toHaveBeenCalledWith(expect.any(ArrayBuffer), "en");

    await userEvent.click(await screen.findByRole("button", { name: "Start · 1:30" }));
    say([]);
    await userEvent.click(screen.getByRole("button", { name: "I'm done" }));

    expect(await screen.findByRole("heading", { name: "You said it 28% faster, with fewer long pauses." })).toBeInTheDocument();
    expect(screen.getByText("Long pauses: 6 → 4 → 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("asks for the round again when nothing was heard", async () => {
    const recordFasterRound = vi.fn();
    renderRun({ fasterRounds: vi.fn().mockResolvedValue(view(1)), transcribe: vi.fn(), recordFasterRound });
    await userEvent.click(await screen.findByRole("button", { name: "Start · 2:00" }));
    await userEvent.click(screen.getByRole("button", { name: "I'm done" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("I didn't hear anything in this round.");
    expect(recordFasterRound).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("can be skipped without a microphone", async () => {
    const { onDone } = renderRun({ fasterRounds: vi.fn().mockResolvedValue(view(1)) }, "blocked");
    expect(await screen.findByText("Say it faster needs the microphone.")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Skip" }));
    expect(onDone).toHaveBeenCalled();
  });
});
