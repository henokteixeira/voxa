import { describe, expect, it } from "vitest";
import { clearestGain } from "./check-in-format";

const pace = (wordsPerMinute: number | null, longPauses: number) => ({
  id: "c",
  recordedAt: "2026-11-09T10:00:00Z",
  wordsPerMinute,
  longPauses,
  mistakesPer100Words: null,
  otherLanguageWords: null,
});

describe("clearestGain", () => {
  it("names the pace first, then fewer long pauses, and nothing when neither got better", () => {
    expect(clearestGain(pace(81, 9), pace(68, 9))).toEqual({ kind: "pace", before: 68, now: 81 });
    expect(clearestGain(pace(60, 4), pace(68, 9))).toEqual({ kind: "pauses", before: 9, now: 4 });
    expect(clearestGain(pace(null, 9), pace(68, 9))).toBeNull();
  });
});
