import { describe, expect, it } from "vitest";
import { categoryLabel, seenAgo } from "./format";

describe("seenAgo", () => {
  const now = new Date("2026-11-06T00:30:00");
  it.each([
    ["2026-11-06T00:10:00", "today"],
    ["2026-11-05T23:50:00", "yesterday"],
    ["2026-11-03T12:00:00", "3 days ago"],
    ["2026-11-07T09:00:00", "today"],
  ])("%s is %s", (iso, label) => {
    expect(seenAgo(iso, now)).toBe(label);
  });
});

describe("categoryLabel", () => {
  it("capitalizes and spaces the category", () => {
    expect(categoryLabel("grammar")).toBe("Grammar");
    expect(categoryLabel("word_choice")).toBe("Word choice");
  });
});
