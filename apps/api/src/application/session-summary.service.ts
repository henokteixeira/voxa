import { Inject, Injectable } from "@nestjs/common";
import { fluencySignals, type SessionTiming } from "../domain/conversation/fluency.js";
import type { Mode } from "../domain/conversation/mode.js";
import { goalsFor } from "../domain/conversation/session-goals.js";
import { SessionNotFoundError } from "../domain/conversation/session-errors.js";
import { type ChatTurn, NEW_WORD_CATEGORY, type PracticeTarget, type Session } from "../domain/conversation/types.js";
import type { SpeakingLevel } from "../domain/level/speaking-level.js";
import { chooseTakeaways, type Takeaway } from "../domain/mistakes/takeaways.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { LEVEL_ASSESSOR_PORT, type LevelAssessorPort } from "../domain/ports/level-assessor.port.js";
import { LEVEL_REPOSITORY, type LevelRepository } from "../domain/ports/level.repository.js";
import { MISTAKE_REPOSITORY, type MistakeRepository, type SessionMistake } from "../domain/ports/mistake.repository.js";
import { SESSION_REPOSITORY, type SessionRepository } from "../domain/ports/session.repository.js";
import { type SessionSignals, unaidedShare } from "../domain/progress/signal-trend.js";
import { LearnerMemoryService } from "./learner-memory.service.js";
import { openSession } from "./session-context.js";

export interface SessionSummary {
  sessionId: string;
  mode: Mode;
  language: string;
  mistakes: SessionMistake[];
  selfCorrections: number;
  signals: SessionSignals;
  goals: { id: string; covered: boolean }[];
  /** The mistakes practiced in this session; `met` when the learner said the correct form. */
  targets: (PracticeTarget & { met: boolean })[];
  /** Up to three patterns from the session for the learner to take away and try saying. */
  takeaways: Takeaway[];
  /** After a placement interview: the level it gave, or null when the learner said nothing. Null in other modes. */
  level: SpeakingLevel | null;
}

/** Ends a session and sums it up: mistakes, signals, goals, targets, takeaways and, after placement, the level. */
@Injectable()
export class SessionSummaryService {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: Pick<SessionRepository, "get" | "history" | "saveTiming" | "end" | "outcome">,
    @Inject(MISTAKE_REPOSITORY) private readonly mistakes: Pick<MistakeRepository, "forSession">,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LEVEL_ASSESSOR_PORT) private readonly assessor: LevelAssessorPort,
    @Inject(LEVEL_REPOSITORY) private readonly levels: Pick<LevelRepository, "forSession" | "addForSession">,
    // The class itself (not a Pick): Nest injects by the parameter's runtime type.
    private readonly memory: LearnerMemoryService,
  ) {}

  /** Keeps the timing the web app measured so far, so a session left open still has it when it is closed. */
  async saveTiming(sessionId: string, timing: SessionTiming): Promise<void> {
    if (!(await this.sessions.saveTiming(sessionId, timing))) await openSession(this.sessions, sessionId);
  }

  /**
   * Ends the session (once: ending it again keeps the first timing) and returns its summary. `endedAt` defaults
   * to now; a session closed for being left idle ends at its last activity.
   */
  async end(sessionId: string, timing: SessionTiming | null = null, endedAt?: Date): Promise<SessionSummary> {
    const session = await this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    const history = await this.sessions.history(sessionId);
    let level: SpeakingLevel | null = null;
    if (session.mode === "placement") {
      // Assessed before the session is marked ended: if the tutor is down, ending again retries it.
      level = (await this.levels.forSession(sessionId)) ?? (session.endedAt ? null : await this.assessPlacement(session, history));
    }
    if (!session.endedAt) await this.sessions.end(sessionId, timing, endedAt);
    // Off the summary's path. It saves once, so ending again does not add anything twice.
    void this.memory.rememberLater(sessionId);
    const [mistakes, outcome] = await Promise.all([
      this.mistakes.forSession(sessionId),
      this.sessions.outcome(sessionId),
    ]);
    return {
      sessionId,
      mode: session.mode,
      language: session.language,
      mistakes,
      selfCorrections: mistakes.filter((m) => m.selfCorrected).length,
      signals: {
        ...fluencySignals({
          // New words are not mistakes.
          mistakes: mistakes.filter((m) => m.category !== NEW_WORD_CATEGORY),
          learnerUtterances: history.filter((t) => t.role === "user").map((t) => t.content),
          timing: outcome?.timing ?? null,
        }),
        unaidedShare: unaidedShare(outcome?.learnerTurns ?? { total: 0, assisted: 0 }),
      },
      goals: goalsFor(session.mode).map((id) => ({ id, covered: session.coveredGoals.includes(id) })),
      targets: session.targets.map((t) => ({ ...t, met: session.metTargets.includes(t.original) })),
      // The placement interview only observes: nothing to take away.
      takeaways: session.mode === "placement" ? [] : chooseTakeaways(mistakes),
      level,
    };
  }

  /** Estimates and stores the level from the interview. No level when the learner said nothing. */
  private async assessPlacement(session: Session, history: ChatTurn[]): Promise<SpeakingLevel | null> {
    if (!history.some((t) => t.role === "user")) return null;
    const { level, evidence } = await this.assessor.assess({ language: session.language, turns: history });
    const placed: SpeakingLevel = {
      language: session.language,
      level,
      source: "placement",
      evidence,
      assessedAt: this.clock.now(),
    };
    // Two ends at once can both assess; the session still keeps one level.
    return this.levels.addForSession(session.id, placed);
  }
}
