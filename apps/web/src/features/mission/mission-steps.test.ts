import { describe, expect, it } from "vitest";
import type { MissionSteps } from "@/lib/api";
import { currentStep, loadMissionTakeaways, MISSION_MINUTES, saveMissionTakeaways, stepsDone } from "./mission-steps";

const steps = (done: Partial<MissionSteps>): MissionSteps => ({
  checkIn: null,
  listen: false,
  expressions: false,
  task: false,
  faster: false,
  review: false,
  ...done,
});

describe("mission steps", () => {
  it("opens on the first step not done, the check-in first on its day", () => {
    expect(currentStep(steps({}))).toBe("listen");
    expect(currentStep(steps({ checkIn: false }))).toBe("checkIn");
    expect(currentStep(steps({ checkIn: true, listen: true, expressions: true }))).toBe("task");
    expect(currentStep(steps({ listen: true, expressions: true, task: true, faster: true, review: true }))).toBeNull();
  });

  it("counts the 5 steps done, not the check-in", () => {
    expect(stepsDone(steps({ checkIn: true, listen: true }))).toBe(1);
  });

  it("takes 25 minutes", () => {
    expect(MISSION_MINUTES).toBe(25);
  });

  it("keeps step 3's takeaways for step 5", () => {
    saveMissionTakeaways("m1", ["p1", "p2"]);
    expect(loadMissionTakeaways("m1")).toEqual(["p1", "p2"]);
    expect(loadMissionTakeaways("m2")).toEqual([]);
  });
});
