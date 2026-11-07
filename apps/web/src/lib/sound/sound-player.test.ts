import { describe, expect, it, vi } from "vitest";
import { CUES } from "./cues";
import { createSoundPlayer } from "./sound-player";

/** A Web Audio stand-in that counts the oscillators started. */
function fakeContext() {
  const started = vi.fn();
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const context = {
    state: "running",
    currentTime: 0,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    createOscillator: () => ({ type: "", frequency: param(), connect: vi.fn(), start: started, stop: vi.fn() }),
    createGain: () => ({ gain: param(), connect: vi.fn() }),
  };
  return { context: context as unknown as AudioContext, started };
}

/** Oscillators a cue starts: two partials per note. */
const oscillators = (cue: keyof typeof CUES) => CUES[cue].length * 2;

describe("createSoundPlayer", () => {
  it("plays a cue at once", () => {
    const { context, started } = fakeContext();
    createSoundPlayer({ createContext: () => context }).play("hint");
    expect(started).toHaveBeenCalledTimes(oscillators("hint"));
  });

  it("waits for the tutor's voice to end, keeping only the latest cues", () => {
    const { context, started } = fakeContext();
    const player = createSoundPlayer({ createContext: () => context });
    player.setVoiceActive(true);
    player.play("xp");
    player.play("hint");
    player.play("goalCovered");
    expect(started).not.toHaveBeenCalled();
    player.setVoiceActive(false);
    expect(started).toHaveBeenCalledTimes(oscillators("hint") + oscillators("goalCovered"));
  });

  it("stays silent when turned off, and drops what was waiting", () => {
    const { context, started } = fakeContext();
    const player = createSoundPlayer({ createContext: () => context });
    player.setVoiceActive(true);
    player.play("hint");
    player.setEnabled(false);
    player.setVoiceActive(false);
    player.play("xp");
    expect(started).not.toHaveBeenCalled();
  });

  it("does nothing where Web Audio is missing", () => {
    expect(() => createSoundPlayer({ createContext: () => null }).play("xp")).not.toThrow();
  });
});
