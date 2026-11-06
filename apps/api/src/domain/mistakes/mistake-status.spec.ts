import { describe, expect, it } from "vitest";
import { MASTERED_STREAK, mistakeStatus } from "./mistake-status.js";

// Each list holds whether the learner fixed the mistake alone, newest occurrence first.
describe("mistakeStatus (provisional rule, pending confirmation)", () => {
  it("is open when the learner did not fix the latest occurrence", () => {
    expect(mistakeStatus([false])).toBe("open");
    expect(mistakeStatus([false, true, true, true])).toBe("open");
  });

  it("is open when there is no occurrence", () => {
    expect(mistakeStatus([])).toBe("open");
  });

  it("is improving when the learner fixed the latest occurrence", () => {
    expect(mistakeStatus([true])).toBe("improving");
    expect(mistakeStatus([true, false, true])).toBe("improving");
  });

  it(`is mastered when the learner fixed the latest ${MASTERED_STREAK} occurrences in a row`, () => {
    expect(mistakeStatus(Array(MASTERED_STREAK).fill(true))).toBe("mastered");
    expect(mistakeStatus([...Array(MASTERED_STREAK).fill(true), false])).toBe("mastered");
  });
});
