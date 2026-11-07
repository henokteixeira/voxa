import type { TodayProgress } from "@/lib/api";

/** True when a session that earned `sessionTotal` XP is what closed today's goal. */
export function closedTheGoal(today: TodayProgress, sessionTotal: number): boolean {
  return today.goalMet && today.earnedXp - sessionTotal < today.goalXp;
}
