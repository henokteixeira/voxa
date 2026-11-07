import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionTiming } from "../domain/conversation/fluency.js";
import type { Clock } from "../domain/ports/clock.port.js";
import type { Database } from "../infra/db/db.module.js";
import { DrizzleProgressRepository } from "../infra/db/drizzle-progress.repository.js";
import { DrizzleSessionRepository } from "../infra/db/drizzle-session.repository.js";
import { createTestDatabase } from "../infra/db/test-database.js";
import { ProgressService } from "./progress.service.js";

let db: Database;
let close: () => Promise<void>;
let sessions: DrizzleSessionRepository;
let now: Date;
let service: ProgressService;
const clock: Clock = { now: () => now };
const tz = "America/Sao_Paulo";

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  sessions = new DrizzleSessionRepository(db);
  service = new ProgressService(new DrizzleProgressRepository(db), sessions, clock);
  now = new Date("2026-11-07T15:00:00Z");
});
afterEach(() => close());

/** About `minutes` of conversation at `wpm` words a minute of the learner's speech. */
function timing(minutes: number, wpm = 60): SessionTiming {
  const learnerSpeechMs = (minutes * 60_000) / 2;
  return { learnerSpeechMs, tutorSpeechMs: learnerSpeechMs, pausesMs: [], longPausesMs: [], spokenWords: (wpm * learnerSpeechMs) / 60_000 };
}

async function endedSession(t: SessionTiming | null, language = "en") {
  const session = await sessions.create({ language, mode: "daily" });
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
        { reason: "goal_covered", count: 2, points: 10 },
        { reason: "self_corrected", count: 1, points: 5 },
      ],
      total: 25,
    });
    expect(await service.awardSession({ ...input, goalsCovered: 3 })).toEqual(first);
  });

  it("gives a record bonus for the fastest pace after 3 measured sessions", async () => {
    for (const wpm of [50, 55, 60]) await endedSession(timing(4, wpm));
    const sessionId = await endedSession(timing(4, 70));
    const xp = await service.awardSession({ sessionId, goalsCovered: 0, selfCorrections: 0, wordsPerMinute: 70 });
    expect(xp.awards.map((a) => a.reason)).toEqual(["practice_minute", "personal_record"]);
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
      goalXp: 40,
      earnedXp: 0,
      goalMet: false,
      streakDays: 0,
      points: { practice_minute: 1, goal_covered: 5, self_corrected: 5, personal_record: 5 },
    });
  });

  it("adds up today's XP in the learner's day and counts the streak", async () => {
    now = new Date("2026-11-01T12:00:00Z");
    await service.setDailyMinutes("en", 15, tz); // 20 XP a day
    for (const at of ["2026-11-05T15:00:00Z", "2026-11-06T15:00:00Z", "2026-11-07T15:00:00Z"]) {
      now = new Date(at);
      const sessionId = await endedSession(timing(21));
      await service.awardSession({ sessionId, goalsCovered: 0, selfCorrections: 0, wordsPerMinute: null });
    }
    // 01:00 UTC on Nov 8 is still Nov 7 in São Paulo.
    now = new Date("2026-11-08T01:00:00Z");
    const today = await service.today("en", tz);
    expect(today).toMatchObject({ day: "2026-11-07", goalXp: 20, earnedXp: 21, goalMet: true, streakDays: 3 });
    // Other languages keep their own XP.
    expect((await service.today("es", tz)).earnedXp).toBe(0);
  });

  it("judges each past day by the goal set at the time", async () => {
    now = new Date("2026-11-01T12:00:00Z");
    await service.setDailyMinutes("en", 15, tz);
    now = new Date("2026-11-06T15:00:00Z");
    await service.awardSession({ sessionId: await endedSession(timing(21)), goalsCovered: 0, selfCorrections: 0, wordsPerMinute: null });
    now = new Date("2026-11-07T15:00:00Z");
    const raised = await service.setDailyMinutes("en", 60, tz);
    expect(raised).toMatchObject({ minutesPerDay: 60, goalXp: 80, streakDays: 1 });
  });
});
