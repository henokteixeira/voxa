import { describe, expect, it } from "vitest";
import { comesBack, reviewDay } from "./format";

describe("comesBack", () => {
  const now = new Date(2026, 10, 7, 22, 0);

  it("counts calendar days, not hours", () => {
    expect(comesBack(new Date(2026, 10, 8, 6, 0).toISOString(), now)).toBe("tomorrow");
    expect(comesBack(new Date(2026, 10, 10, 9, 0).toISOString(), now)).toBe("in 3 days");
  });

  it("says today for an item already due, in the learner's language", () => {
    expect(comesBack(new Date(2026, 10, 6).toISOString(), now, "pt-BR")).toBe("hoje");
  });
});

describe("reviewDay", () => {
  const now = new Date(2026, 10, 7, 9, 0); // Saturday

  it("says today or tomorrow, a weekday this week, else the date", () => {
    expect(reviewDay(new Date(2026, 10, 6).toISOString(), now)).toBe("today");
    expect(reviewDay(new Date(2026, 10, 8).toISOString(), now)).toBe("tomorrow");
    expect(reviewDay(new Date(2026, 10, 10).toISOString(), now)).toBe("Tue");
    expect(reviewDay(new Date(2026, 10, 21).toISOString(), now)).toBe("Nov 21");
  });
});
