import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionTiming } from "../domain/conversation/fluency.js";
import type { Clock } from "../domain/ports/clock.port.js";
import type { Database } from "../infra/db/db.module.js";
import { DrizzleFasterRoundRepository } from "../infra/db/drizzle-faster-round.repository.js";
import { DrizzleMistakeRepository } from "../infra/db/drizzle-mistake.repository.js";
import { DrizzleProgressRepository } from "../infra/db/drizzle-progress.repository.js";
import { DrizzleReviewRepository } from "../infra/db/drizzle-review.repository.js";
import { DrizzleSessionRepository } from "../infra/db/drizzle-session.repository.js";
import { createTestDatabase } from "../infra/db/test-database.js";
import { ProgressService } from "./progress.service.js";

let db: Database;
let learnerId: string;
let close: () => Promise<void>;
let sessions: DrizzleSessionRepository;
let now: Date;
let service: ProgressService;
let reviews: DrizzleReviewRepository;
const clock: Clock = { now: () => now };
const tz = "America/Sao_Paulo";

beforeEach(async () => {
  ({ db, learnerId, close } = await createTestDatabase());
  sessions = new DrizzleSessionRepository(db, learnerId);
  reviews = new DrizzleReviewRepository(db, learnerId);
  service = new ProgressService(new DrizzleProgressRepository(db, learnerId), sessions, clock, reviews, new DrizzleFasterRoundRepository(db));
  now = new Date("2026-11-07T15:00:00Z");
});
afterEach(() => close());

/** About `minutes` of conversation at `wpm` words a minute of the learner's speech. */
function timing(minutes: number, wpm = 60): SessionTiming {
  const learnerSpeechMs = (minutes * 60_000) / 2;
  return { learnerSpeechMs, tutorSpeechMs: learnerSpeechMs, pausesMs: [], longPausesMs: [], spokenWords: (wpm * learnerSpeechMs) / 60_000 };
}

/** Sessions end at the real time: start them long enough before so their timing fits. */
async function endedSession(t: SessionTiming | null, language = "en", startedAt = new Date(Date.now() - 2 * 3_600_000)) {
  const session = await sessions.create({ language, mode: "daily", startedAt });
  await sessions.end(session.id, t);
  return session.id;
}

describe("ProgressService.awardSession", () => {
  it("awards a session once, however many times it ends", async () => {
    const sessionId = await endedSession(timing(10));
    const input = { sessionId, goalsCovered: 2, selfCorrections: 1, wordsPerMinute: 60 };

    const first = await service.awardSession(input);
    expect(first).toEqual({
      awards: [
        { reason: "practice_minute", count: 10, points: 10 },
        { reason: "goal_covered", count: 2, points: 2 },
        { reason: "self_corrected", count: 1, points: 2 },
      ],
      total: 14,
    });
    expect(await service.awardSession({ ...input, goalsCovered: 3 })).toEqual(first);
  });

  it("counts the XP at the time given: a session the server closed counts on the day it was left", async () => {
    const sessionId = await endedSession(timing(10));
    const awardedAt = new Date("2026-11-06T23:00:00Z");
    await service.awardSession({ sessionId, goalsCovered: 0, selfCorrections: 0, wordsPerMinute: null, awardedAt });
    expect(await new DrizzleProgressRepository(db, learnerId).earnedSince("en", new Date(0))).toEqual([{ total: 10, awardedAt }]);
  });

  it("gives a record bonus for the fastest pace after 3 measured sessions", async () => {
    for (const wpm of [50, 55, 60]) {
      const id = await endedSession(timing(4, wpm));
      await service.awardSession({ sessionId: id, goalsCovered: 0, selfCorrections: 0, wordsPerMinute: wpm });
    }
    const sessionId = await endedSession(timing(4, 70));
    const xp = await service.awardSession({ sessionId, goalsCovered: 0, selfCorrections: 0, wordsPerMinute: 70 });
    expect(xp.awards.map((a) => a.reason)).toEqual(["practice_minute", "personal_record"]);
  });

  it("never counts more minutes than the session lasted", async () => {
    const sessionId = await endedSession(timing(600), "en", new Date(Date.now() - 5 * 60_000));
    const xp = await service.awardSession({ sessionId, goalsCovered: 0, selfCorrections: 0, wordsPerMinute: null });
    expect(xp.awards).toEqual([{ reason: "practice_minute", count: 5, points: 5 }]);
  });

  it("keeps a session that earned nothing at nothing when it ends again", async () => {
    for (const wpm of [50, 55, 60]) {
      const id = await endedSession(timing(1, wpm));
      await service.awardSession({ sessionId: id, goalsCovered: 0, selfCorrections: 0, wordsPerMinute: wpm });
    }
    const sessionId = await endedSession(timing(0.5));
    const input = { sessionId, goalsCovered: 0, selfCorrections: 0, wordsPerMinute: 20 };
    expect(await service.awardSession(input)).toEqual({ awards: [], total: 0 });
    expect(await service.awardSession({ ...input, wordsPerMinute: 90 })).toEqual({ awards: [], total: 0 });
  });

  it("gives no goal XP for the placement interview's tasks", async () => {
    const session = await sessions.create({ language: "en", mode: "placement", startedAt: new Date(Date.now() - 3_600_000) });
    await sessions.end(session.id, timing(8));
    const xp = await service.awardSession({ sessionId: session.id, goalsCovered: 5, selfCorrections: 0, wordsPerMinute: null });
    expect(xp).toEqual({ awards: [{ reason: "practice_minute", count: 8, points: 8 }], total: 8 });
  });

  it("refuses a session that has not ended", async () => {
    const session = await sessions.create({ language: "en", mode: "daily" });
    await expect(service.awardSession({ sessionId: session.id, goalsCovered: 0, selfCorrections: 0, wordsPerMinute: null })).rejects.toThrow(/not ended/);
  });
});

describe("ProgressService.today", () => {
  it("starts at the default 30 minutes a day, with nothing earned", async () => {
    expect(await service.today("en", tz)).toEqual({
      day: "2026-11-07",
      minutesPerDay: 30,
      goalXp: 30,
      earnedXp: 0,
      goalMet: false,
      streakDays: 0,
      points: { practice_minute: 1, goal_covered: 1, self_corrected: 2, personal_record: 3 },
      reviewPoints: 1,
    });
  });

  it("adds 1 XP for each item reviewed today, right or wrong, once a day per item", async () => {
    const session = await sessions.create({ language: "en", mode: "daily" });
    const word = await new DrizzleMistakeRepository(db, learnerId).record(
      { language: "en", original: "prazo", correction: "deadline", category: "new_word", pattern: null },
      { sessionId: session.id, severity: "minor" },
    );
    const subject = { kind: "new_word" as const, id: word!.id };
    await reviews.save("en", subject, { step: 0, dueAt: now }, null);
    const answer = async (recalled: boolean, at: string) => {
      const card = await reviews.addCard(subject, { cue: "Qual é o prazo?", answer: "What is the deadline?" });
      await reviews.answerCard(card.id, recalled, new Date(at));
    };
    await answer(false, "2026-11-07T14:00:00Z");
    await answer(true, "2026-11-07T14:01:00Z"); // the same item again today: no more XP
    await answer(true, "2026-11-06T14:00:00Z"); // yesterday
    await reviews.addCard(subject, { cue: "Qual é o prazo?", answer: "What is the deadline?" }); // never answered

    expect((await service.today("en", tz)).earnedXp).toBe(1);
  });

  it("adds 1 XP a minute of say-it-faster speech, the session's rounds added up", async () => {
    const sessionId = await endedSession(null);
    const rounds = new DrizzleFasterRoundRepository(db);
    const told = (round: number, speechMs: number, at: string) =>
      rounds.saveOnce({ sessionId, language: "en", round, timeLimitMs: 120_000, transcript: "I fixed the bug", spokenWords: 4, speechMs, longPauses: 0, recordedAt: new Date(at) });
    await told(1, 110_000, "2026-11-07T14:00:00Z");
    await told(2, 85_000, "2026-11-07T14:03:00Z");
    await told(3, 58_000, "2026-11-07T14:05:00Z");

    expect((await service.today("en", tz)).earnedXp).toBe(4);
    expect((await service.today("es", tz)).earnedXp).toBe(0);
  });

  it("adds up today's XP in the learner's day and counts the streak", async () => {
    now = new Date("2026-11-01T12:00:00Z");
    await service.setDailyMinutes("en", 15, tz); // 15 XP a day
    for (const at of ["2026-11-05T15:00:00Z", "2026-11-06T15:00:00Z", "2026-11-07T15:00:00Z"]) {
      now = new Date(at);
      const sessionId = await endedSession(timing(21));
      await service.awardSession({ sessionId, goalsCovered: 0, selfCorrections: 0, wordsPerMinute: null });
    }
    // 01:00 UTC on Nov 8 is still Nov 7 in São Paulo.
    now = new Date("2026-11-08T01:00:00Z");
    const today = await service.today("en", tz);
    expect(today).toMatchObject({ day: "2026-11-07", goalXp: 15, earnedXp: 21, goalMet: true, streakDays: 3 });
    // Other languages keep their own XP.
    expect((await service.today("es", tz)).earnedXp).toBe(0);
  });

  it("judges today by the goal set today, even after the XP was earned", async () => {
    now = new Date("2026-11-07T13:00:00Z");
    await service.awardSession({ sessionId: await endedSession(timing(25)), goalsCovered: 0, selfCorrections: 0, wordsPerMinute: null });
    now = new Date("2026-11-07T14:00:00Z");
    expect(await service.setDailyMinutes("en", 15, tz)).toMatchObject({ goalXp: 15, earnedXp: 25, goalMet: true, streakDays: 1 });
    expect(await service.setDailyMinutes("en", 60, tz)).toMatchObject({ goalXp: 60, goalMet: false, streakDays: 0 });
  });

  it("judges each past day by the goal set at the time", async () => {
    now = new Date("2026-11-01T12:00:00Z");
    await service.setDailyMinutes("en", 15, tz);
    now = new Date("2026-11-06T15:00:00Z");
    await service.awardSession({ sessionId: await endedSession(timing(21)), goalsCovered: 0, selfCorrections: 0, wordsPerMinute: null });
    now = new Date("2026-11-07T15:00:00Z");
    const raised = await service.setDailyMinutes("en", 60, tz);
    expect(raised).toMatchObject({ minutesPerDay: 60, goalXp: 60, streakDays: 1 });
  });
});
