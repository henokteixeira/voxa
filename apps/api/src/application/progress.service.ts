import { Inject, Injectable } from "@nestjs/common";
import {
  conversationMs,
  type DailyMinutes,
  dailyGoalXp,
  isPersonalRecord,
  type LocalDay,
  localDay,
  minutesForDay,
  streakDays,
  XP_PER_REVIEW,
  XP_POINTS,
  type XpAward,
  type XpReason,
  xpForSession,
} from "../domain/progress/daily-goal.js";
import { rewardsGoals } from "../domain/conversation/mode.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { PROGRESS_REPOSITORY, type ProgressRepository } from "../domain/ports/progress.repository.js";
import { REVIEW_REPOSITORY, type ReviewRepository } from "../domain/ports/review.repository.js";
import { SESSION_REPOSITORY, type SessionRepository } from "../domain/ports/session.repository.js";

/** Today's goal as the Today screen shows it. */
export interface TodayProgress {
  day: LocalDay;
  minutesPerDay: DailyMinutes;
  goalXp: number;
  earnedXp: number;
  goalMet: boolean;
  streakDays: number;
  /** XP for each reason, so the app can show XP as it is earned. */
  points: Record<XpReason, number>;
  /** XP for each answered review item. */
  reviewPoints: number;
}

/** What a session earned, for its summary. */
export interface SessionXp {
  awards: XpAward[];
  total: number;
}

/** What the session summary already knows that earns XP. */
export interface EndedSession {
  sessionId: string;
  goalsCovered: number;
  selfCorrections: number;
  wordsPerMinute: number | null;
}

/**
 * How far back XP is read for the streak: a deliberate cap, so a streak shows at most about this many days.
 * Days follow the time zone of the device asking: travelling shifts past days with it (accepted for now).
 */
const STREAK_LOOKBACK_DAYS = 400;

export class SessionNotEndedError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} has not ended: there is no XP to award yet.`);
    this.name = "SessionNotEndedError";
  }
}

@Injectable()
export class ProgressService {
  constructor(
    @Inject(PROGRESS_REPOSITORY) private readonly progress: ProgressRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: Pick<SessionRepository, "get" | "outcome">,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(REVIEW_REPOSITORY) private readonly reviews: Pick<ReviewRepository, "answeredSince">,
  ) {}

  async today(language: string, timeZone: string): Promise<TodayProgress> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - STREAK_LOOKBACK_DAYS * 86_400_000);
    const [history, sessionsEarned, reviewsAnswered] = await Promise.all([
      this.progress.dailyMinutesHistory(language),
      this.progress.earnedSince(language, since),
      this.reviews.answeredSince(language, since),
    ]);
    const earned = [...sessionsEarned, ...reviewsAnswered.map((awardedAt) => ({ total: XP_PER_REVIEW, awardedAt }))];

    const xpByDay = new Map<LocalDay, number>();
    for (const { total, awardedAt } of earned) {
      const day = localDay(awardedAt, timeZone);
      xpByDay.set(day, (xpByDay.get(day) ?? 0) + total);
    }
    const goalFor = (day: LocalDay) => dailyGoalXp(minutesForDay(history, day, timeZone));
    const metDays = new Set([...xpByDay].filter(([day, xp]) => xp >= goalFor(day)).map(([day]) => day));

    const today = localDay(now, timeZone);
    const minutesPerDay = minutesForDay(history, today, timeZone);
    const earnedXp = xpByDay.get(today) ?? 0;
    return {
      day: today,
      minutesPerDay,
      goalXp: dailyGoalXp(minutesPerDay),
      earnedXp,
      goalMet: metDays.has(today),
      streakDays: streakDays(metDays, today),
      points: XP_POINTS,
      reviewPoints: XP_PER_REVIEW,
    };
  }

  async setDailyMinutes(language: string, minutesPerDay: DailyMinutes, timeZone: string): Promise<TodayProgress> {
    await this.progress.setDailyMinutes(language, { minutesPerDay, setAt: this.clock.now() });
    return this.today(language, timeZone);
  }

  /** Awards a session's XP once; ending it again returns the same XP. */
  async awardSession(ended: EndedSession): Promise<SessionXp> {
    const existing = await this.progress.forSession(ended.sessionId);
    if (existing) return { awards: existing.awards, total: existing.total };

    const [session, outcome] = await Promise.all([
      this.sessions.get(ended.sessionId),
      this.sessions.outcome(ended.sessionId),
    ]);
    if (!session?.endedAt) throw new SessionNotEndedError(ended.sessionId);
    const awardedAt = this.clock.now();
    const awards = xpForSession({
      conversationMs: conversationMs(outcome?.timing ?? null, session.endedAt.getTime() - session.startedAt.getTime()),
      goalsCovered: rewardsGoals(session.mode) ? ended.goalsCovered : 0,
      selfCorrections: ended.selfCorrections,
      personalRecord: isPersonalRecord(
        ended.wordsPerMinute,
        await this.progress.pacesBefore(session.language, awardedAt),
      ),
    });
    const stored = await this.progress.awardOnce({
      sessionId: ended.sessionId,
      language: session.language,
      awards,
      total: awards.reduce((sum, award) => sum + award.points, 0),
      wordsPerMinute: ended.wordsPerMinute,
      awardedAt,
    });
    return { awards: stored.awards, total: stored.total };
  }
}
