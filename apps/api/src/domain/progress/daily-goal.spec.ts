import { describe, expect, it } from "vitest";
import { dailyGoalXp, isPersonalRecord, localDay, streakDays, xpForFasterRounds, xpForSession } from "./daily-goal.js";

describe("dailyGoalXp", () => {
  it("makes the goal 1 XP a minute of the chosen time", () => {
    expect([15, 30, 45, 60].map((m) => dailyGoalXp(m as 15 | 30 | 45 | 60))).toEqual([15, 30, 45, 60]);
  });
});

describe("xpForSession", () => {
  it("gives 1 XP a full minute, with small bonuses for goals, self-corrections and records", () => {
    expect(
      xpForSession({ conversationMs: 8 * 60_000 + 59_000, goalsCovered: 2, selfCorrections: 1, personalRecord: true }),
    ).toEqual([
      { reason: "practice_minute", count: 8, points: 8 },
      { reason: "goal_covered", count: 2, points: 2 },
      { reason: "self_corrected", count: 1, points: 2 },
      { reason: "personal_record", count: 1, points: 3 },
    ]);
  });

  it("leaves out what did not happen", () => {
    expect(xpForSession({ conversationMs: 30_000, goalsCovered: 0, selfCorrections: 0, personalRecord: false })).toEqual([]);
  });
});

describe("isPersonalRecord", () => {
  it("needs 3 earlier sessions and a faster pace than all of them", () => {
    expect(isPersonalRecord(90, [60, 70])).toBe(false);
    expect(isPersonalRecord(90, [60, 70, 80])).toBe(true);
    expect(isPersonalRecord(80, [60, 70, 80])).toBe(false);
    expect(isPersonalRecord(null, [60, 70, 80])).toBe(false);
  });
});

describe("localDay", () => {
  it("uses the learner's time zone", () => {
    const at = new Date("2026-11-07T02:00:00Z");
    expect(localDay(at, "UTC")).toBe("2026-11-07");
    expect(localDay(at, "America/Sao_Paulo")).toBe("2026-11-06");
  });
});

describe("streakDays", () => {
  const met = (...days: string[]) => new Set(days);

  it("counts days in a row, with today only once its goal is met", () => {
    expect(streakDays(met(), "2026-11-07")).toBe(0);
    expect(streakDays(met("2026-11-05", "2026-11-06"), "2026-11-07")).toBe(2);
    expect(streakDays(met("2026-11-05", "2026-11-06", "2026-11-07"), "2026-11-07")).toBe(3);
  });

  it("forgives one missed day a week", () => {
    expect(streakDays(met("2026-11-03", "2026-11-04", "2026-11-06"), "2026-11-07")).toBe(3);
    // A missed yesterday is forgiven too: the streak is still alive today.
    expect(streakDays(met("2026-11-04", "2026-11-05"), "2026-11-07")).toBe(2);
  });

  it("ends at a second miss within 7 days", () => {
    expect(streakDays(met("2026-11-01", "2026-11-02", "2026-11-04", "2026-11-06"), "2026-11-07")).toBe(2);
    expect(streakDays(met("2026-11-01", "2026-11-02"), "2026-11-07")).toBe(0);
  });

  it("forgives again once a week has passed", () => {
    expect(
      streakDays(met("2026-10-28", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-07"), "2026-11-07"),
    ).toBe(9);
  });
});

describe("xpForFasterRounds", () => {
  const round = (sessionId: string, speechMs: number, at: string) => ({ sessionId, speechMs, recordedAt: new Date(at) });

  it("gives 1 XP a minute of speech, adding up each session's rounds", () => {
    const rounds = [
      round("a", 110_000, "2026-11-09T10:02:00Z"),
      round("a", 85_000, "2026-11-09T10:04:00Z"),
      round("a", 58_000, "2026-11-09T10:05:00Z"),
      round("b", 50_000, "2026-11-09T11:00:00Z"),
    ];
    expect(xpForFasterRounds(rounds)).toEqual([
      { sessionId: "a", total: 4, awardedAt: new Date("2026-11-09T10:05:00Z") },
      { sessionId: "b", total: 0, awardedAt: new Date("2026-11-09T11:00:00Z") },
    ]);
  });

  it("lands on the day of the session's latest round, whatever the order", () => {
    const rounds = [round("a", 60_000, "2026-11-10T02:59:00Z"), round("a", 60_000, "2026-11-10T03:01:00Z"), round("a", 60_000, "2026-11-10T03:00:00Z")];
    // 03:01 UTC is just past midnight in São Paulo: the XP is the new day's.
    const [award] = xpForFasterRounds(rounds);
    expect(award.awardedAt).toEqual(new Date("2026-11-10T03:01:00Z"));
    expect(localDay(award.awardedAt, "America/Sao_Paulo")).toBe("2026-11-10");
  });

  it("has nothing without rounds", () => {
    expect(xpForFasterRounds([])).toEqual([]);
  });
});
