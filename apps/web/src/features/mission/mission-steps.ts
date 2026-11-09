import type { MissionSteps } from "@/lib/api";

export const MISSION_PATH = "/mission";

/** The 5 steps in order; on check-in day the check-in comes first, as step 0. */
export const MISSION_STEPS = ["listen", "expressions", "task", "faster", "review"] as const;
export type MissionStepName = "checkIn" | (typeof MISSION_STEPS)[number];

/** Minutes of each step for the 25-minute mission (D1.1). */
export const STEP_MINUTES: Record<(typeof MISSION_STEPS)[number], number> = {
  listen: 4,
  expressions: 3,
  task: 10,
  faster: 5,
  review: 3,
};
export const MISSION_MINUTES = Object.values(STEP_MINUTES).reduce((sum, n) => sum + n, 0);

/** The first step not done yet, or null when the mission is done. */
export function currentStep(steps: MissionSteps): MissionStepName | null {
  if (steps.checkIn === false) return "checkIn";
  return MISSION_STEPS.find((step) => !steps[step]) ?? null;
}

/** How many of the 5 steps are done (the check-in is not one of them). */
export function stepsDone(steps: MissionSteps): number {
  return MISSION_STEPS.filter((step) => steps[step]).length;
}

/** Step 3's conversation, opened as part of the mission. */
export function missionSessionPath(situation: string, missionId: string): string {
  return `/session/${situation}?mission=${encodeURIComponent(missionId)}`;
}

const TAKEAWAYS_KEY = "voxa.missionTakeaways";

/**
 * Step 3's takeaway patterns, kept on the device so step 5 reviews them even after the app was closed.
 * Only the last mission's are kept. Best effort: without storage step 5 reviews what is due.
 */
export function saveMissionTakeaways(missionId: string, patternIds: string[]) {
  try {
    localStorage.setItem(TAKEAWAYS_KEY, JSON.stringify({ missionId, patternIds }));
  } catch {
    // Storage blocked or full.
  }
}

export function loadMissionTakeaways(missionId: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(TAKEAWAYS_KEY) ?? "null") as { missionId?: unknown; patternIds?: unknown } | null;
    if (!value || value.missionId !== missionId || !Array.isArray(value.patternIds)) return [];
    return value.patternIds.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}
