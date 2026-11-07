import { describe, expect, it } from "vitest";
import { countsAsReview, firstReview, nextReview, reviewStatus } from "./review-schedule.js";

const now = new Date("2026-11-07T12:00:00Z");
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);

describe("review schedule", () => {
  it("brings a new item back the next day", () => {
    expect(firstReview(now)).toEqual({ step: 0, dueAt: inDays(1) });
  });

  it("goes 1, 3, 7, 14 and then 30 days on each right answer", () => {
    let state = firstReview(now);
    const waits = [];
    for (let i = 0; i < 6; i++) {
      state = nextReview(state, "recalled", now);
      waits.push((state.dueAt.getTime() - now.getTime()) / 86_400_000);
    }
    expect(waits).toEqual([3, 7, 14, 30, 30, 30]);
  });

  it("moves one step back on a miss, never below the first", () => {
    expect(nextReview({ step: 3, dueAt: now }, "missed", now)).toEqual({ step: 2, dueAt: inDays(7) });
    expect(nextReview({ step: 0, dueAt: now }, "missed", now)).toEqual({ step: 0, dueAt: inDays(1) });
  });

  it("counts a correct use in a conversation only once the review is due", () => {
    expect(countsAsReview({ step: 1, dueAt: inDays(1) }, now)).toBe(false);
    expect(countsAsReview({ step: 1, dueAt: now }, now)).toBe(true);
  });

  it("is mastered from the 14-day wait on", () => {
    expect([0, 1, 2, 3, 4].map(reviewStatus)).toEqual(["new", "improving", "improving", "mastered", "mastered"]);
  });
});
