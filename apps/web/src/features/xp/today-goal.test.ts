import { describe, expect, it } from "vitest";
import type { TodayProgress } from "@/lib/api";
import { closedTheGoal } from "./today-goal";

const today = (earnedXp: number): TodayProgress => ({
  day: "2026-11-07",
  minutesPerDay: 30,
  goalXp: 40,
  earnedXp,
  goalMet: earnedXp >= 40,
  streakDays: 1,
  reviewPoints: 1,
  points: { practice_minute: 1, goal_covered: 5, self_corrected: 5, personal_record: 5 },
});

describe("closedTheGoal", () => {
  it("is true only for the session that crossed the goal", () => {
    expect(closedTheGoal(today(45), 10)).toBe(true);
    expect(closedTheGoal(today(60), 10)).toBe(false);
    expect(closedTheGoal(today(30), 10)).toBe(false);
  });
});
