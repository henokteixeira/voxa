import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { SessionTiming } from "../../domain/conversation/fluency.js";
import { isTrackStage, isTrackSupport, type TrackState } from "../../domain/conversation/guided-track.js";
import { isMode } from "../../domain/conversation/mode.js";
import { isSupportStep, type SupportStep } from "../../domain/level/speaking-level.js";
import type { TutorMemory } from "../../domain/memory/learner-fact.js";
import type { ChatTurn, PendingCorrection, PracticeTarget, Session } from "../../domain/conversation/types.js";
import type {
  NewTurn,
  SessionOutcome,
  SessionProgress,
  SessionRepository,
  TurnClaim,
  UnfinishedSession,
} from "../../domain/ports/session.repository.js";
import { DATABASE, type Database } from "./db.module.js";
import { LEARNER_ID } from "./learner.js";
import { sessions, sessionTargets, sessionXp, turns } from "./schema.js";

type SessionRow = typeof sessions.$inferSelect;

type TargetRow = typeof sessionTargets.$inferSelect;

function toSession(row: SessionRow, targets: TargetRow[]): Session {
  if (!isMode(row.mode)) throw new Error(`Unknown mode in session ${row.id}: ${row.mode}`);
  if (row.supportStep !== null && !isSupportStep(row.supportStep)) {
    throw new Error(`Unknown support step in session ${row.id}: ${row.supportStep}`);
  }
  return {
    id: row.id,
    language: row.language,
    mode: row.mode,
    pending: row.pending ?? null,
    withdrawnMistakes: row.withdrawnMistakes,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    coveredGoals: row.coveredGoals,
    lastCheckInAt: row.lastCheckInAt,
    targets: targets.map(({ original, correction, category }) => ({ original, correction, category })),
    metTargets: targets.filter((target) => target.met).map((target) => target.original),
    step: row.supportStep,
    scaffold: row.scaffold,
    keyWords: row.keyWords,
    track: toTrack(row),
    memory: row.memory,
    missionId: row.missionId,
  };
}

function toTrack(row: SessionRow): TrackState | null {
  if (row.trackStage === null) return null;
  if (!isTrackStage(row.trackStage)) throw new Error(`Unknown track stage in session ${row.id}: ${row.trackStage}`);
  if (!isTrackSupport(row.trackSupport)) throw new Error(`Unknown track support in session ${row.id}: ${row.trackSupport}`);
  return {
    stage: row.trackStage,
    goal: row.trackGoal,
    support: row.trackSupport,
    tries: row.trackTries,
    unaidedStreak: row.trackUnaidedStreak,
  };
}

/** The script's columns; all cleared (stage null) outside the script. */
function trackColumns(track: TrackState | null) {
  return {
    trackStage: track?.stage ?? null,
    trackGoal: track?.goal ?? null,
    trackSupport: track?.support ?? null,
    trackTries: track?.tries ?? 0,
    trackUnaidedStreak: track?.unaidedStreak ?? 0,
  };
}

@Injectable()
export class DrizzleSessionRepository implements SessionRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARNER_ID) private readonly learnerId: string,
  ) {}

  async create({
    step,
    track,
    targets = [],
    ...input
  }: Pick<Session, "language" | "mode"> & {
    startedAt?: Date;
    memory?: TutorMemory;
    targets?: PracticeTarget[];
    step?: SupportStep | null;
    track?: TrackState | null;
    missionId?: string | null;
  }): Promise<Session> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(sessions)
        .values({ ...input, learnerId: this.learnerId, supportStep: step ?? null, ...trackColumns(track ?? null) })
        .returning();
      const rows = targets.length
        ? await tx
            .insert(sessionTargets)
            .values(targets.map((target, position) => ({ ...target, sessionId: row.id, position, language: row.language })))
            .returning()
        : [];
      return toSession(row, rows);
    });
  }

  /** The session `id`, if it is this learner's. */
  private own(id: string) {
    return and(eq(sessions.id, id), eq(sessions.learnerId, this.learnerId));
  }

  async latestForMission(missionId: string): Promise<Session | null> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.missionId, missionId), eq(sessions.learnerId, this.learnerId)))
      .orderBy(desc(sessions.startedAt), desc(sessions.id))
      .limit(1);
    return row ? this.withTargets(row) : null;
  }

  async get(id: string): Promise<Session | null> {
    const [row] = await this.db.select().from(sessions).where(this.own(id)).limit(1);
    return row ? this.withTargets(row) : null;
  }

  private async withTargets(row: SessionRow): Promise<Session> {
    const targets = await this.db
      .select()
      .from(sessionTargets)
      .where(eq(sessionTargets.sessionId, row.id))
      .orderBy(asc(sessionTargets.position));
    return toSession(row, targets);
  }

  async claimTurn(sessionId: string, turnsSeen: number): Promise<TurnClaim> {
    // The row lock waits for any other turn of this session still being saved.
    const [session] = await this.db
      .select({ endedAt: sessions.endedAt })
      .from(sessions)
      .where(this.own(sessionId))
      .for("update");
    if (!session || session.endedAt) return "ended";
    const [row] = await this.db.select({ total: count() }).from(turns).where(eq(turns.sessionId, sessionId));
    return (row?.total ?? 0) === turnsSeen ? "claimed" : "taken";
  }

  async appendTurn(sessionId: string, turn: NewTurn): Promise<void> {
    await this.db
      .insert(turns)
      .values({ sessionId, role: turn.role, content: turn.content, assisted: turn.assisted ?? false });
    await this.db.update(sessions).set({ lastActiveAt: new Date() }).where(this.own(sessionId));
  }

  async history(sessionId: string): Promise<ChatTurn[]> {
    const rows = await this.db
      .select({ role: turns.role, content: turns.content })
      .from(turns)
      .where(eq(turns.sessionId, sessionId))
      .orderBy(asc(turns.seq));
    return rows.map((r) => ({ role: r.role === "user" ? "user" : "assistant", content: r.content }));
  }

  async setScaffold(sessionId: string, scaffold: string | null): Promise<void> {
    await this.db.update(sessions).set({ scaffold, keyWords: [] }).where(this.own(sessionId));
  }

  async withdrawPending(sessionId: string, original: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ pending: null, withdrawnMistakes: sql`array_append(${sessions.withdrawnMistakes}, ${original})` })
      .where(this.own(sessionId));
  }

  async setPending(sessionId: string, pending: PendingCorrection | null): Promise<void> {
    await this.db.update(sessions).set({ pending }).where(this.own(sessionId));
  }

  async setProgress(sessionId: string, { step, track, metTargets, ...progress }: SessionProgress): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(sessions)
        .set({ ...progress, supportStep: step, ...trackColumns(track) })
        .where(this.own(sessionId));
      // `original` is unique per session, so each target is met or not by its own words.
      await tx
        .update(sessionTargets)
        .set({ met: metTargets.length ? inArray(sessionTargets.original, metTargets) : sql`false` })
        .where(eq(sessionTargets.sessionId, sessionId));
    });
  }

  async saveTiming(sessionId: string, timing: SessionTiming): Promise<boolean> {
    const saved = await this.db
      .update(sessions)
      .set({ timing, lastActiveAt: new Date() })
      .where(and(this.own(sessionId), isNull(sessions.endedAt)))
      .returning({ id: sessions.id });
    return saved.length > 0;
  }

  async unfinished(query: {
    idleBefore: Date;
    endedAfter: Date;
    limit: number;
    after?: UnfinishedSession;
  }): Promise<UnfinishedSession[]> {
    // To the millisecond, like the Date the page cursor comes back as.
    const endsAt = sql<Date>`date_trunc('milliseconds', coalesce(${sessions.endedAt}, ${sessions.lastActiveAt}))`;
    const rows = await this.db
      .select({ id: sessions.id, endsAt: sql<Date | string>`${endsAt}` })
      .from(sessions)
      .leftJoin(sessionXp, eq(sessionXp.sessionId, sessions.id))
      .where(
        and(
          eq(sessions.learnerId, this.learnerId),
          or(
            and(isNull(sessions.endedAt), lt(sessions.lastActiveAt, query.idleBefore)),
            // Its end (by the learner or the server) is the last change: when that stopped half way.
            and(
              isNotNull(sessions.endedAt),
              isNull(sessionXp.sessionId),
              gt(sessions.lastActiveAt, query.endedAfter),
              lt(sessions.lastActiveAt, query.idleBefore),
            ),
          ),
          query.after && sql`(${endsAt}, ${sessions.id}) > (${query.after.endsAt.toISOString()}::timestamptz, ${query.after.id}::uuid)`,
        ),
      )
      .orderBy(asc(endsAt), asc(sessions.id))
      .limit(query.limit);
    return rows.map((row) => ({ id: row.id, endsAt: new Date(row.endsAt) }));
  }

  async end(sessionId: string, timing: SessionTiming | null, endedAt = new Date()): Promise<void> {
    await this.db
      .update(sessions)
      // Without a timing, the one saved during the session stays.
      .set({ endedAt, lastActiveAt: new Date(), ...(timing && { timing }) })
      .where(this.own(sessionId));
  }

  async outcome(sessionId: string): Promise<SessionOutcome | null> {
    const [row] = await this.db
      .select({ timing: sessions.timing })
      .from(sessions)
      .where(this.own(sessionId))
      .limit(1);
    if (!row) return null;
    const [learnerTurns] = await this.db
      .select({ total: count(), assisted: count(sql`case when ${turns.assisted} then 1 end`) })
      .from(turns)
      .where(and(eq(turns.sessionId, sessionId), eq(turns.role, "user")));
    return {
      timing: row.timing ?? null,
      learnerTurns: learnerTurns ?? { total: 0, assisted: 0 },
    };
  }
}
