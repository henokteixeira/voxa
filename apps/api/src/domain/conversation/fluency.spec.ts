import { describe, expect, it } from "vitest";
import { countWords, fluencySignals } from "./fluency.js";

const timing = {
  learnerSpeechMs: 120_000,
  tutorSpeechMs: 40_000,
  pausesMs: [1000, 2000, 3000],
  longPausesMs: [1500, 1100, 2000],
  spokenWords: 190,
};
const serious = (selfCorrected: boolean) => ({ severity: "serious" as const, selfCorrected });
const minor = { severity: "minor" as const, selfCorrected: false };

describe("countWords", () => {
  it("counts words, keeping contractions and hyphens as one", () => {
    expect(countWords("I'm  waiting for the API-keys, you know?")).toBe(7);
    expect(countWords("   ")).toBe(0);
  });
});

describe("fluencySignals", () => {
  it("computes the four signals", () => {
    const signals = fluencySignals({
      mistakes: [serious(true), serious(true), serious(false), minor],
      learnerUtterances: ["one two three four five", "six seven eight nine ten"],
      timing,
    });
    expect(signals).toEqual({
      selfCorrectionRate: 2 / 3,
      mistakesPer100Words: 40,
      averagePauseMs: 2000,
      wordsPerMinute: 95,
      longPausesPerMinute: 1.5,
    });
  });

  it("has no self-correction rate when no mistake needed a hint", () => {
    const signals = fluencySignals({ mistakes: [minor], learnerUtterances: ["hello there"], timing });
    expect(signals.selfCorrectionRate).toBeNull();
    expect(signals.mistakesPer100Words).toBe(50);
  });

  it("has no word-based signal when the learner said nothing", () => {
    const signals = fluencySignals({ mistakes: [], learnerUtterances: [], timing });
    expect(signals.mistakesPer100Words).toBeNull();
  });

  it("has no timing signals when the timing was not measured", () => {
    const signals = fluencySignals({ mistakes: [], learnerUtterances: ["hi"], timing: null });
    expect(signals.averagePauseMs).toBeNull();
    expect(signals.wordsPerMinute).toBeNull();
    expect(signals.longPausesPerMinute).toBeNull();
  });

  it("has no rate for a session measured before words and long pauses were", () => {
    const signals = fluencySignals({
      mistakes: [],
      learnerUtterances: ["hi"],
      timing: { learnerSpeechMs: 60_000, tutorSpeechMs: 0, pausesMs: [] },
    });
    expect(signals.wordsPerMinute).toBeNull();
    expect(signals.longPausesPerMinute).toBeNull();
  });

  it("has no pause without pauses and no rate without speech", () => {
    const signals = fluencySignals({
      mistakes: [],
      learnerUtterances: ["hi"],
      timing: { learnerSpeechMs: 0, tutorSpeechMs: 0, pausesMs: [], longPausesMs: [], spokenWords: 0 },
    });
    expect(signals.averagePauseMs).toBeNull();
    expect(signals.wordsPerMinute).toBeNull();
  });
});
