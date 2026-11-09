import { describe, expect, it } from "vitest";
import { isMissionSituation, MISSION_SITUATIONS, nextSituation } from "./mission.js";

describe("the daily mission's situation", () => {
  it("starts with the stand-up and goes round work and everyday in turn", () => {
    expect(nextSituation(null)).toBe("daily");
    const seen = [nextSituation(null)];
    for (let i = 1; i < MISSION_SITUATIONS.length + 1; i++) seen.push(nextSituation(seen[i - 1]));
    expect(seen).toEqual(["daily", "my_day", "presentation", "story", "review", "opinion", "daily"]);
  });

  it("leaves free talk and the placement out", () => {
    expect(isMissionSituation("free_talk")).toBe(false);
    expect(isMissionSituation("placement")).toBe(false);
    expect(isMissionSituation("story")).toBe(true);
  });
});
