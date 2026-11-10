import { describe, expect, it } from "vitest";
import { compareSignals, type SessionSignals, trendOf, unaidedShare } from "./signal-trend.js";

const none: SessionSignals = {
  unaidedShare: null,
  wordsPerMinute: null,
  longPausesPerMinute: null,
  averagePauseMs: null,
  mistakesPer100Words: null,
  selfCorrectionRate: null,
  wordsPerAnswer: null,
};
const s = (over: Partial<SessionSignals>): SessionSignals => ({ ...none, ...over });

describe("trendOf", () => {
  it("reads a change by the signal's direction, ignoring changes under 10%", () => {
    expect(trendOf("wordsPerMinute", 80, 70)).toBe("better");
    expect(trendOf("wordsPerMinute", 74, 70)).toBe("steady");
    expect(trendOf("averagePauseMs", 2000, 1500)).toBe("worse");
    expect(trendOf("longPausesPerMinute", 1, 2)).toBe("better");
  });

  it("needs ten points either way for a share", () => {
    expect(trendOf("unaidedShare", 0.55, 0.5)).toBe("steady");
    expect(trendOf("unaidedShare", 0.7, 0.5)).toBe("better");
    expect(trendOf("selfCorrectionRate", 0.2, 0.5)).toBe("worse");
  });

  it("counts any rise from zero", () => {
    expect(trendOf("longPausesPerMinute", 0.5, 0)).toBe("worse");
    expect(trendOf("longPausesPerMinute", 0, 0)).toBe("steady");
  });
});

describe("compareSignals", () => {
  it("compares each signal with its average over the last three sessions, skipping those that did not measure it", () => {
    const earlier = [
      s({ wordsPerMinute: 60, unaidedShare: 0.5 }),
      s({ wordsPerMinute: 70 }),
      s({ wordsPerMinute: 80, unaidedShare: 0.3 }),
      s({ wordsPerMinute: 10 }), // a fourth session back does not count
    ];
    expect(compareSignals(s({ wordsPerMinute: 85, unaidedShare: 0.6, averagePauseMs: 900 }), earlier)).toEqual({
      sessions: 3,
      signals: [
        { name: "unaidedShare", current: 0.6, baseline: 0.4, trend: "better" },
        { name: "wordsPerMinute", current: 85, baseline: 70, trend: "better" },
      ],
    });
  });

  it("has nothing to say without an earlier session or a signal measured in both", () => {
    expect(compareSignals(s({ wordsPerMinute: 85 }), [])).toBeNull();
    expect(compareSignals(s({ wordsPerMinute: 85 }), [s({ averagePauseMs: 900 })])).toBeNull();
  });
});

describe("unaidedShare", () => {
  it("is the share of the learner's turns without help", () => {
    expect(unaidedShare({ total: 4, assisted: 1 })).toBe(0.75);
    expect(unaidedShare({ total: 0, assisted: 0 })).toBeNull();
  });
});
