import { describe, expect, it } from "vitest";
import type { SessionSignals } from "../progress/signal-trend.js";
import { nextStepLevel, proposeStepChange } from "./step-change.js";

const session = (unaidedShare: number | null, longPausesPerMinute: number | null = null): SessionSignals => ({
  unaidedShare,
  longPausesPerMinute,
  wordsPerMinute: null,
  averagePauseMs: null,
  mistakesPer100Words: null,
  selfCorrectionRate: null,
  wordsPerAnswer: null,
});

describe("proposeStepChange", () => {
  it("proposes going up after three sessions in a row with at least 80% of the answers without help", () => {
    expect(proposeStepChange("A2", [session(0.9), session(0.8), session(1)])).toEqual({ direction: "up", to: "B1" });
    expect(proposeStepChange("A2", [session(0.9), session(0.7), session(1)])).toBeNull();
  });

  it("does not go up when the long pauses rose", () => {
    expect(proposeStepChange("A2", [session(0.9, 3), session(0.9, 2), session(0.9, 1)])).toBeNull();
    expect(proposeStepChange("A2", [session(0.9, 1), session(0.9, 2), session(0.9, 1)])).toMatchObject({ direction: "up" });
  });

  it("proposes going down after three sessions in a row under 40%", () => {
    expect(proposeStepChange("B1", [session(0.3), session(0), session(0.39)])).toEqual({ direction: "down", to: "A2" });
  });

  it("needs three sessions that measured it", () => {
    expect(proposeStepChange("A2", [session(0.9), session(null), session(0.9)])).toBeNull();
    expect(proposeStepChange("A2", [session(0.9), session(null), session(0.9), session(0.9)])).toMatchObject({ direction: "up" });
  });

  it("proposes nothing past the end of the scale", () => {
    expect(proposeStepChange("A1", [session(0), session(0), session(0)])).toBeNull();
    expect(proposeStepChange("C1", [session(1), session(1), session(1)])).toBeNull();
  });
});

describe("nextStepLevel", () => {
  it("skips levels with the same support step", () => {
    expect(nextStepLevel("B2", "up")).toBe("C1");
    expect(nextStepLevel("C2", "down")).toBe("B2");
    expect(nextStepLevel("C1", "up")).toBeNull();
  });
});
