import { describe, expect, it } from "vitest";
import { MODES } from "./mode.js";
import { checkInDue, checkInLine, describeGoal, goalsFor, mergeCovered } from "./session-goals.js";

const min = (n: number) => n * 60_000;

describe("checkInDue", () => {
  it("ends the placement interview with its own question, and asks at 10 minutes", () => {
    const all = ["warm_up", "routine", "past_work", "project", "opinion"];
    expect(checkInDue({ coveredBefore: [], mode: "placement", covered: all, elapsedMs: min(4), lastCheckInMs: null })).toBe("placement_done");
    expect(checkInLine("placement_done", "en")).toMatch(/see your level/);
    expect(checkInDue({ coveredBefore: [], mode: "placement", covered: [], elapsedMs: min(10), lastCheckInMs: null })).toBe("time");
  });

  it("asks once every goal of the mode is covered", () => {
    expect(checkInDue({ coveredBefore: [], mode: "daily", covered: ["yesterday", "today"], elapsedMs: min(3), lastCheckInMs: null })).toBeNull();
    expect(
      checkInDue({ coveredBefore: [], mode: "daily", covered: ["yesterday", "today", "blockers"], elapsedMs: min(3), lastCheckInMs: null }),
    ).toBe("goals_met");
  });

  it("asks at 15 minutes when goals are still open", () => {
    expect(checkInDue({ coveredBefore: [], mode: "review", covered: [], elapsedMs: min(14.9), lastCheckInMs: null })).toBeNull();
    expect(checkInDue({ coveredBefore: [], mode: "review", covered: [], elapsedMs: min(15), lastCheckInMs: null })).toBe("time");
  });

  it("asks at 8 minutes in free talk", () => {
    expect(checkInDue({ coveredBefore: [], mode: "free_talk", covered: [], elapsedMs: min(7.9), lastCheckInMs: null })).toBeNull();
    expect(checkInDue({ coveredBefore: [], mode: "free_talk", covered: [], elapsedMs: min(8), lastCheckInMs: null })).toBe("time");
  });

  it("asks again every 5 minutes after the learner kept going", () => {
    const covered = ["yesterday", "today", "blockers"];
    expect(checkInDue({ coveredBefore: covered, mode: "daily", covered, elapsedMs: min(7.9), lastCheckInMs: min(3) })).toBeNull();
    expect(checkInDue({ coveredBefore: covered, mode: "daily", covered, elapsedMs: min(8), lastCheckInMs: min(3) })).toBe("time");
    expect(checkInDue({ coveredBefore: [], mode: "free_talk", covered: [], elapsedMs: min(13), lastCheckInMs: min(8) })).toBe("time");
  });
});

describe("checkInDue after a question about time", () => {
  it("still asks on the turn that covers the last goal", () => {
    expect(
      checkInDue({
        mode: "daily",
        coveredBefore: ["yesterday"],
        covered: ["yesterday", "today", "blockers"],
        elapsedMs: min(16),
        lastCheckInMs: min(15),
      }),
    ).toBe("goals_met");
  });
});

describe("checkInDue after a hint turn", () => {
  it("asks on the next turn when the goals were covered on a turn that could not ask", () => {
    const covered = ["yesterday", "today", "blockers"];
    expect(checkInDue({ mode: "daily", coveredBefore: covered, covered, elapsedMs: min(4), lastCheckInMs: null })).toBe(
      "goals_met",
    );
  });
});

describe("checkInLine", () => {
  it("is spoken in the language being practiced, English until another one has its lines", () => {
    expect(checkInLine("goals_met", "en-US")).toMatch(/stop here or keep going/);
    expect(checkInLine("time", "es")).toBe(checkInLine("time", "en"));
  });
});

describe("mergeCovered", () => {
  it("keeps only the mode's goals, once, in the mode's order", () => {
    expect(mergeCovered("daily", ["today"], ["blockers", "today", "status", "made_up"])).toEqual(["today", "blockers"]);
    expect(mergeCovered("free_talk", [], ["today"])).toEqual([]);
  });
});

describe("everyday modes", () => {
  it("each has three goals the tutor can read", () => {
    for (const mode of ["my_day", "story", "opinion"] as const) {
      expect(goalsFor(mode)).toHaveLength(3);
      for (const goal of goalsFor(mode)) expect(describeGoal(goal)).toBeTruthy();
    }
  });

  it("asks once the story is told", () => {
    const told = ["story_setting", "story_events", "story_ending"];
    expect(checkInDue({ coveredBefore: [], mode: "story", covered: told, elapsedMs: min(4), lastCheckInMs: null })).toBe("goals_met");
  });

  it("never shares a goal id between modes", () => {
    const ids = MODES.flatMap((mode) => goalsFor(mode));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
