import { describe, expect, it } from "vitest";
import { type FasterRound, fasterResult, roundLimitMs, roundPace } from "./faster-rounds.js";

const round = (n: number, spokenWords: number, speechMs: number, longPauses: number): FasterRound => ({
  round: n,
  timeLimitMs: roundLimitMs(n),
  transcript: "",
  spokenWords,
  speechMs,
  longPauses,
});

describe("say it faster", () => {
  it("gives the second round half the time: 2:00, 1:00", () => {
    expect([1, 2].map((n) => roundLimitMs(n))).toEqual([120_000, 60_000]);
    expect([1, 2].map((n) => roundLimitMs(n, "supported"))).toEqual([120_000, 60_000]);
    expect([1, 2].map((n) => roundLimitMs(n, "build_full"))).toEqual([60_000, 30_000]);
    expect([1, 2].map((n) => roundLimitMs(n, "build_light"))).toEqual([60_000, 30_000]);
    expect(() => roundLimitMs(3)).toThrow(RangeError);
  });

  it("measures the pace of a round as words per minute of speech", () => {
    expect(roundPace(round(1, 120, 100_000, 6))).toEqual({ round: 1, wordsPerMinute: 72, longPauses: 6 });
    expect(roundPace(round(1, 0, 0, 0)).wordsPerMinute).toBeNull();
  });

  it("compares the last round with the first once both are told", () => {
    const rounds = [round(1, 120, 100_000, 6), round(2, 92, 60_000, 2)];
    expect(fasterResult(rounds.slice(0, 1))).toBeNull();
    expect(fasterResult(rounds)).toEqual({
      rounds: [
        { round: 1, wordsPerMinute: 72, longPauses: 6 },
        { round: 2, wordsPerMinute: 92, longPauses: 2 },
      ],
      paceChangePercent: 28,
      fewerLongPauses: true,
    });
  });

  it("has no pace change when a round had no speech", () => {
    const result = fasterResult([round(1, 0, 0, 0), round(2, 50, 50_000, 1)]);
    expect(result).toMatchObject({ paceChangePercent: null, fewerLongPauses: false });
  });
});
