import { describe, expect, it } from "vitest";
import { type CheckIn, checkInDueAt, checkInPace } from "./check-in.js";

const now = new Date("2026-11-09T10:00:00Z");

describe("check-in", () => {
  it("is due now the first time, then 2 weeks after the last one", () => {
    expect(checkInDueAt(null, now)).toEqual(now);
    expect(checkInDueAt(now, now)).toEqual(new Date("2026-11-23T10:00:00Z"));
  });

  it("measures the pace of a check-in", () => {
    const checkIn: CheckIn = {
      id: "c1",
      language: "en",
      task: "present_project",
      recordedAt: now,
      transcript: "",
      spokenWords: 136,
      speechMs: 120_000,
      longPauses: 9,
    };
    expect(checkInPace(checkIn)).toEqual({ id: "c1", recordedAt: now, wordsPerMinute: 68, longPauses: 9 });
  });
});
