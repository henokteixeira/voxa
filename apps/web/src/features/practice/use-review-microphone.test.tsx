import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { type VoiceDeps, VoiceDepsContext } from "@/features/session/voice-deps";
import type { MicrophoneHandlers } from "@/lib/voice/microphone";
import { useReviewMicrophone } from "./use-review-microphone";

function setup(open: VoiceDeps["openMicrophone"]) {
  const deps = { openMicrophone: open } as VoiceDeps;
  const wrapper = ({ children }: { children: ReactNode }) => <VoiceDepsContext.Provider value={deps}>{children}</VoiceDepsContext.Provider>;
  const onTurn = vi.fn();
  const hook = renderHook(({ cue }: { cue: string | null }) => useReviewMicrophone(cue, onTurn), {
    wrapper,
    initialProps: { cue: "c1" as string | null },
  });
  return { ...hook, onTurn };
}

describe("useReviewMicrophone", () => {
  it("listens only for a cue, hands over the turn, and stops at the end", async () => {
    let handlers!: MicrophoneHandlers;
    const mic = { pause: vi.fn(), resume: vi.fn(), sendNow: vi.fn(), unlock: vi.fn(), stop: vi.fn() };
    const { result, rerender, unmount, onTurn } = setup(vi.fn(async (h: MicrophoneHandlers) => ((handlers = h), mic)));
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(mic.resume).toHaveBeenCalledTimes(1);

    act(() => handlers.onSpeechStart());
    expect(result.current.speaking).toBe(true);
    const wav = new ArrayBuffer(4);
    act(() => handlers.onTurn(wav));
    // With how long the learner took to start speaking to the cue.
    expect(onTurn).toHaveBeenCalledWith(wav, expect.any(Number));
    expect(mic.pause).toHaveBeenCalled();

    act(() => handlers.onSpeechStart());
    rerender({ cue: null });
    rerender({ cue: "c2" });
    // Speech cut short on the last cue does not show on this one.
    expect(result.current.speaking).toBe(false);

    unmount();
    expect(mic.stop).toHaveBeenCalled();
  });

  it("is unavailable when the microphone can't be opened, so the learner types", async () => {
    const { result } = setup(vi.fn(async () => Promise.reject(new Error("blocked"))));
    await waitFor(() => expect(result.current.available).toBe(false));
  });
});
