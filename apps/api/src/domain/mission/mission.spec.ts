import { describe, expect, it } from "vitest";
import { isMissionSituation, MISSION_SITUATIONS, missionDone, missionSteps, nextSituation } from "./mission.js";

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

describe("the daily mission's steps", () => {
  const none = { listenedAt: null, expressionsDoneAt: null, reviewDoneAt: null, fasterSkippedAt: null };
  const at = new Date("2026-11-09T12:00:00Z");
  const all = { listenedAt: at, expressionsDoneAt: at, reviewDoneAt: at, fasterSkippedAt: null };
  const notCheckInDay = { due: false, doneToday: false };

  it("reads the marked steps, the conversation and the 2 rounds", () => {
    expect(missionSteps(none, { checkIn: notCheckInDay, taskEnded: false, fasterRounds: 1 })).toEqual({
      checkIn: null,
      listen: false,
      expressions: false,
      task: false,
      faster: false,
      review: false,
    });
    const steps = missionSteps(all, { checkIn: notCheckInDay, taskEnded: true, fasterRounds: 2 });
    expect(missionDone(steps)).toBe(true);
  });

  it("counts say it faster as done when the learner skipped it", () => {
    const steps = missionSteps({ ...all, fasterSkippedAt: at }, { checkIn: notCheckInDay, taskEnded: true, fasterRounds: 0 });
    expect(steps.faster).toBe(true);
    expect(missionDone(steps)).toBe(true);
  });

  it("adds the check-in as step 0 on its day, done or not", () => {
    const facts = { taskEnded: true, fasterRounds: 2 };
    expect(missionSteps(all, { ...facts, checkIn: { due: true, doneToday: false } }).checkIn).toBe(false);
    expect(missionDone(missionSteps(all, { ...facts, checkIn: { due: true, doneToday: false } }))).toBe(false);
    expect(missionSteps(all, { ...facts, checkIn: { due: false, doneToday: true } }).checkIn).toBe(true);
  });
});
