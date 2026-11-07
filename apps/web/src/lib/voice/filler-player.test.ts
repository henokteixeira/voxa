import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFillerPlayer } from "./filler-player";

const speaker = { play: vi.fn(), stop: vi.fn(), unlock: vi.fn(), close: vi.fn() };
const clips = [new ArrayBuffer(1), new ArrayBuffer(2), new ArrayBuffer(3)];
let finish: () => void;

function playerWith(lines: ArrayBuffer[], options?: { random: () => number }) {
  const player = createFillerPlayer(options);
  player.setClips(lines);
  return player;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  speaker.play.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
});
afterEach(() => vi.useRealTimers());

describe("createFillerPlayer", () => {
  it("plays a line only once the answer takes longer than the delay", () => {
    const player = playerWith(clips, { random: () => 0 });
    player.arm(speaker);
    player.heard();
    vi.advanceTimersByTime(999);
    expect(speaker.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(speaker.play).toHaveBeenCalledWith(clips[0]);
  });

  it("waits for the transcript: a turn with no speech gets no line", () => {
    const player = playerWith(clips);
    player.arm(speaker);
    vi.advanceTimersByTime(3000);
    expect(speaker.play).not.toHaveBeenCalled();
    player.heard();
    expect(speaker.play).toHaveBeenCalledTimes(1);

    player.arm(speaker);
    vi.advanceTimersByTime(3000);
    player.cancel();
    player.heard();
    expect(speaker.play).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the answer comes first", () => {
    const player = playerWith(clips);
    player.arm(speaker);
    player.heard();
    vi.advanceTimersByTime(500);
    player.cancel();
    vi.advanceTimersByTime(1000);
    expect(speaker.play).not.toHaveBeenCalled();
    expect(speaker.stop).not.toHaveBeenCalled();
  });

  it("cuts a line that is still playing", () => {
    const player = playerWith(clips);
    player.arm(speaker);
    player.heard();
    vi.advanceTimersByTime(1000);
    player.cancel();
    expect(speaker.stop).toHaveBeenCalledTimes(1);
  });

  it("does not stop the speaker once the line has ended", async () => {
    const player = playerWith(clips);
    player.arm(speaker);
    player.heard();
    vi.advanceTimersByTime(1000);
    finish();
    await vi.runAllTimersAsync();
    player.cancel();
    expect(speaker.stop).not.toHaveBeenCalled();
  });

  it("never says the same line twice in a row", async () => {
    const player = playerWith(clips, { random: () => 0 });
    for (let turn = 0; turn < 3; turn++) {
      player.arm(speaker);
      player.heard();
      vi.advanceTimersByTime(1000);
      finish();
      await vi.runAllTimersAsync();
    }
    expect(speaker.play.mock.calls.map(([clip]) => clips.indexOf(clip))).toEqual([0, 1, 0]);
  });

  it("stays quiet without clips and ignores a blocked browser", async () => {
    const empty = playerWith([]);
    empty.arm(speaker);
    empty.heard();
    vi.advanceTimersByTime(1000);
    expect(speaker.play).not.toHaveBeenCalled();

    speaker.play.mockRejectedValueOnce(new Error("blocked"));
    const player = playerWith(clips);
    player.arm(speaker);
    player.heard();
    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();
    player.cancel();
    expect(speaker.stop).not.toHaveBeenCalled();
  });
});
