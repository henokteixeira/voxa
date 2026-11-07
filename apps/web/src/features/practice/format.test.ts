import { describe, expect, it } from "vitest";
import { comesBack } from "./format";

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
