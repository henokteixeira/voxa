import { describe, expect, it } from "vitest";
import { CHECK_IN_TOPICS, type CheckIn, checkInDueAt, checkInPace, nextCheckInTopic, topicTaskDue } from "./check-in.js";

const now = new Date("2026-11-09T10:00:00Z");

describe("check-in", () => {
  it("is due now the first time, then 2 weeks after the last one", () => {
    expect(checkInDueAt(null, now)).toEqual(now);
    expect(checkInDueAt(now, now)).toEqual(new Date("2026-11-23T10:00:00Z"));
  });

  it("measures the pace of a check-in", () => {
    const checkIn: CheckIn = {
      id: "c1",
      language: "en",
      task: "present_project",
      recordedAt: now,
      transcript: "It works because we tested it, but it is slow.",
      spokenWords: 136,
      speechMs: 120_000,
      longPauses: 9,
      mistakes: 5,
      otherLanguageWords: 2,
    };
    expect(checkInPace(checkIn)).toEqual({
      id: "c1",
      task: "present_project",
      recordedAt: now,
      wordsPerMinute: 68,
      longPauses: 9,
      mistakesPer100Words: 3.7,
      otherLanguageWords: 2,
      linkingWordsPer100: 1.5,
    });
  });

  it("has no mistake numbers when the transcript was not read", () => {
    const checkIn: CheckIn = {
      id: "c1", language: "en", task: "present_project", recordedAt: now, transcript: "", spokenWords: 0, speechMs: 0,
      longPauses: 0, mistakes: null, otherLanguageWords: null,
    };
    expect(checkInPace(checkIn)).toMatchObject({ mistakesPer100Words: null, otherLanguageWords: null });
  });

  it("gives each topic once, in order, then the one given longest ago", () => {
    expect(nextCheckInTopic([])).toBe("last_weekend");
    expect(nextCheckInTopic(["problem_solved", "last_weekend"])).toBe("explain_skill");
    // A real history keeps every use, newest first: give 25 in a row and check the order goes round.
    const given: string[] = [];
    for (let i = 0; i < 25; i++) given.unshift(nextCheckInTopic(given));
    expect([...given].reverse()).toEqual([...CHECK_IN_TOPICS, ...CHECK_IN_TOPICS, ...CHECK_IN_TOPICS.slice(0, 5)]);
  });

  it("offers the topic task right after a fixed check-in, once, and only for a day", () => {
    const fixed = { task: "present_project", recordedAt: now };
    expect(topicTaskDue([], now)).toBe(false);
    expect(topicTaskDue([fixed], new Date("2026-11-10T09:00:00Z"))).toBe(true);
    expect(topicTaskDue([fixed], new Date("2026-11-10T11:00:00Z"))).toBe(false);
    expect(topicTaskDue([{ task: "last_weekend", recordedAt: now }, fixed], now)).toBe(false);
  });
});
