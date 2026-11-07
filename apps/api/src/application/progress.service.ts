import { Inject, Injectable } from "@nestjs/common";
import { fluencySignals, type SessionTiming } from "../domain/conversation/fluency.js";
import {
  DEFAULT_DAILY_MINUTES,
  type DailyMinutes,
  dailyGoalXp,
  isPersonalRecord,
  type LocalDay,
  localDay,
  streakDays,
  XP_POINTS,
  type XpAward,
  type XpReason,
  xpForSession,
} from "../domain/progress/daily-goal.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import {
  type DailyMinutesSetting,
  PROGRESS_REPOSITORY,
  type ProgressRepository,
} from "../domain/ports/progress.repository.js";
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

/** How far back the streak is counted. */
const STREAK_LOOKBACK_DAYS = 400;

export function conversationMs(timing: SessionTiming | null): number {
  if (!timing) return 0;
  return timing.learnerSpeechMs + timing.tutorSpeechMs + timing.pausesMs.reduce((sum, ms) => sum + ms, 0);
}

/** The setting in force at a moment: the newest one set before it, or the default. */
function minutesAt(history: DailyMinutesSetting[], at: Date): DailyMinutes {
  let minutes = DEFAULT_DAILY_MINUTES;
  for (const setting of history) {
    if (setting.setAt.getTime() <= at.getTime()) minutes = setting.minutesPerDay;
  }
  return minutes;
}

@Injectable()
export class ProgressService {
  constructor(
    @Inject(PROGRESS_REPOSITORY) private readonly progress: ProgressRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: Pick<SessionRepository, "get" | "outcome">,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async today(language: string, timeZone: string): Promise<TodayProgress> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - STREAK_LOOKBACK_DAYS * 86_400_000);
    const [history, earned] = await Promise.all([
      this.progress.dailyMinutesHistory(language),
      this.progress.earnedSince(language, since),
    ]);

    // XP per local day, and the moment of each day's last XP (the goal in force then is that day's goal).
    const days = new Map<LocalDay, { xp: number; last: Date }>();
    for (const { points, earnedAt } of earned) {
      const day = localDay(earnedAt, timeZone);
      const entry = days.get(day) ?? { xp: 0, last: earnedAt };
      days.set(day, { xp: entry.xp + points, last: earnedAt });
    }
    const metDays = new Set(
      [...days].filter(([, { xp, last }]) => xp >= dailyGoalXp(minutesAt(history, last))).map(([day]) => day),
    );

    const today = localDay(now, timeZone);
    const minutesPerDay = minutesAt(history, now);
    const earnedXp = days.get(today)?.xp ?? 0;
    return {
      day: today,
      minutesPerDay,
      goalXp: dailyGoalXp(minutesPerDay),
      earnedXp,
      goalMet: earnedXp >= dailyGoalXp(minutesPerDay),
      streakDays: streakDays(metDays, today),
      points: XP_POINTS,
    };
  }

  async setDailyMinutes(language: string, minutesPerDay: DailyMinutes, timeZone: string): Promise<TodayProgress> {
    await this.progress.setDailyMinutes(language, { minutesPerDay, setAt: this.clock.now() });
    return this.today(language, timeZone);
  }

  /** Awards a session's XP once; ending it again returns the same XP. */
  async awardSession(session: EndedSession): Promise<SessionXp> {
    const existing = await this.progress.awardsFor(session.sessionId);
    if (existing.length > 0) return withTotal(existing);

    const [stored, outcome] = await Promise.all([
      this.sessions.get(session.sessionId),
      this.sessions.outcome(session.sessionId),
    ]);
    if (!stored?.endedAt) throw new Error(`Session ${session.sessionId} has not ended: no XP to award yet.`);
    const timing = outcome?.timing ?? null;
    const earlierPaces = (await this.progress.otherTimings(stored.language, session.sessionId))
      .map((timing) => fluencySignals({ mistakes: [], learnerUtterances: [], timing }).wordsPerMinute)
      .filter((pace): pace is number => pace !== null);
    const awards = xpForSession({
      conversationMs: conversationMs(timing),
      goalsCovered: session.goalsCovered,
      selfCorrections: session.selfCorrections,
      personalRecord: isPersonalRecord(session.wordsPerMinute, earlierPaces),
    });
    await this.progress.award(session.sessionId, stored.language, awards, this.clock.now());
    // Read back: if two ends raced, the stored awards are the ones that count.
    return withTotal(await this.progress.awardsFor(session.sessionId));
  }
}

function withTotal(awards: XpAward[]): SessionXp {
  return { awards, total: awards.reduce((sum, award) => sum + award.points, 0) };
}
