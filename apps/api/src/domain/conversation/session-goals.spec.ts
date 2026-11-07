import { describe, expect, it } from "vitest";
import { checkInDue, mergeCovered } from "./session-goals.js";

const min = (n: number) => n * 60_000;

describe("checkInDue", () => {
  it("asks once every goal of the mode is covered", () => {
    expect(checkInDue({ mode: "daily", covered: ["yesterday", "today"], elapsedMs: min(3), lastCheckInMs: null })).toBeNull();
    expect(
      checkInDue({ mode: "daily", covered: ["yesterday", "today", "blockers"], elapsedMs: min(3), lastCheckInMs: null }),
    ).toBe("goals_met");
  });

  it("asks at 15 minutes when goals are still open", () => {
    expect(checkInDue({ mode: "review", covered: [], elapsedMs: min(14.9), lastCheckInMs: null })).toBeNull();
    expect(checkInDue({ mode: "review", covered: [], elapsedMs: min(15), lastCheckInMs: null })).toBe("time");
  });

  it("asks at 8 minutes in free talk", () => {
    expect(checkInDue({ mode: "free_talk", covered: [], elapsedMs: min(7.9), lastCheckInMs: null })).toBeNull();
    expect(checkInDue({ mode: "free_talk", covered: [], elapsedMs: min(8), lastCheckInMs: null })).toBe("time");
  });

  it("asks again every 5 minutes after the learner kept going", () => {
    const covered = ["yesterday", "today", "blockers"];
    expect(checkInDue({ mode: "daily", covered, elapsedMs: min(7.9), lastCheckInMs: min(3) })).toBeNull();
    expect(checkInDue({ mode: "daily", covered, elapsedMs: min(8), lastCheckInMs: min(3) })).toBe("time");
    expect(checkInDue({ mode: "free_talk", covered: [], elapsedMs: min(13), lastCheckInMs: min(8) })).toBe("time");
  });
});

describe("mergeCovered", () => {
  it("keeps only the mode's goals, once, in the mode's order", () => {
    expect(mergeCovered("daily", ["today"], ["blockers", "today", "status", "made_up"])).toEqual(["today", "blockers"]);
    expect(mergeCovered("free_talk", [], ["today"])).toEqual([]);
  });
});
