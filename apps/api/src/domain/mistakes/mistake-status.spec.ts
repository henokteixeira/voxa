import { describe, expect, it } from "vitest";
import { MASTERED_SESSIONS, mistakeStatus } from "./mistake-status.js";

// The argument is how many sessions, after the latest time the mistake was made,
// the learner used the correct form in.
describe("mistakeStatus (rule confirmed by the user on 2026-11-06)", () => {
  it("is open when the mistake is new or was made again", () => {
    expect(mistakeStatus(0)).toBe("open");
  });

  it("is improving once the learner used the correct form in a later session", () => {
    expect(mistakeStatus(1)).toBe("improving");
    expect(mistakeStatus(MASTERED_SESSIONS - 1)).toBe("improving");
  });

  it(`is mastered after the correct form in ${MASTERED_SESSIONS} sessions without the mistake`, () => {
    expect(mistakeStatus(MASTERED_SESSIONS)).toBe("mastered");
    expect(mistakeStatus(MASTERED_SESSIONS + 4)).toBe("mastered");
  });
});
