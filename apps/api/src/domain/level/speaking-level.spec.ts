import { describe, expect, it } from "vitest";
import { placementDue, supportStepFor } from "./speaking-level.js";

describe("supportStepFor", () => {
  it("starts beginners on the guided track and fluent speakers on harder conversation", () => {
    expect(supportStepFor("A1")).toBe("build_full");
    expect(supportStepFor("A2")).toBe("build_light");
    expect(supportStepFor("B1")).toBe("supported");
    expect(supportStepFor("B2")).toBe("conversation");
    expect(supportStepFor("C1")).toBe("demanding");
    expect(supportStepFor("C2")).toBe("demanding");
  });
});

describe("placementDue", () => {
  const now = new Date("2026-12-05T12:00:00Z");

  it("is due when there was never a placement", () => {
    expect(placementDue(null, now)).toBe(true);
  });

  it("is due 4 weeks after the last placement, not before", () => {
    expect(placementDue(new Date("2026-11-07T12:00:01Z"), now)).toBe(false);
    expect(placementDue(new Date("2026-11-07T12:00:00Z"), now)).toBe(true);
  });
});
