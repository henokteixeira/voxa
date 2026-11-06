import { describe, expect, it } from "vitest";
import { MASTERED_SESSIONS_WITHOUT, MASTERED_STREAK, mistakeStatus } from "./mistake-status.js";

// fixedByLearner: whether the learner fixed each occurrence alone, newest first.
// sessionsSince: practice sessions held after the latest occurrence.
const status = (fixedByLearner: boolean[], sessionsSince = 0) => mistakeStatus({ fixedByLearner, sessionsSince });

describe("mistakeStatus (confirmed by the user on 2026-11-06)", () => {
  it("is open when the learner did not fix the latest occurrence", () => {
    expect(status([false])).toBe("open");
    expect(status([false, true, true, true])).toBe("open");
  });

  it("is open when there is no occurrence", () => {
    expect(status([])).toBe("open");
  });

  it("is improving when the learner fixed the latest occurrence", () => {
    expect(status([true])).toBe("improving");
    expect(status([true, false, true])).toBe("improving");
  });

  it(`is mastered when the learner fixed the latest ${MASTERED_STREAK} occurrences in a row`, () => {
    expect(status(Array(MASTERED_STREAK).fill(true))).toBe("mastered");
    expect(status([...Array(MASTERED_STREAK).fill(true), false])).toBe("mastered");
  });

  it(`is mastered when it has not come back in ${MASTERED_SESSIONS_WITHOUT} sessions`, () => {
    expect(status([false], MASTERED_SESSIONS_WITHOUT)).toBe("mastered");
    expect(status([true], MASTERED_SESSIONS_WITHOUT + 2)).toBe("mastered");
  });

  it("keeps its status with fewer sessions without it", () => {
    expect(status([false], MASTERED_SESSIONS_WITHOUT - 1)).toBe("open");
    expect(status([true], MASTERED_SESSIONS_WITHOUT - 1)).toBe("improving");
  });
});
