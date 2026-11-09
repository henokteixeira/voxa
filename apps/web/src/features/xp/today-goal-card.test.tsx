import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TodayProgress } from "@/lib/api";
import { TodayGoalCard } from "./today-goal-card";

const today = (earnedXp: number, streakDays: number): TodayProgress => ({
  day: "2026-11-09",
  minutesPerDay: 15,
  goalXp: 40,
  earnedXp,
  goalMet: earnedXp >= 40,
  streakDays,
  points: { goal_covered: 0, personal_record: 0, practice_minute: 0, self_corrected: 0 },
});

describe("Today's goal in one line", () => {
  it("shows what is left and the streak, read in full by a screen reader", () => {
    render(<TodayGoalCard today={today(10, 3)} />);
    const goal = screen.getByRole("region", { name: "Today's goal" });
    expect(goal).toHaveTextContent("30 XP to today's goal.");
    expect(screen.getByRole("img", { name: "10 of 40 XP today" })).toBeInTheDocument();
    expect(goal).toHaveTextContent("3 days in a row");
  });

  it("says the goal is met and hides the streak before it starts", () => {
    render(<TodayGoalCard today={today(40, 0)} />);
    const goal = screen.getByRole("region", { name: "Today's goal" });
    expect(goal).toHaveTextContent("Goal met for today.");
    expect(goal).not.toHaveTextContent(/in a row|\d+ days?/);
  });
});
