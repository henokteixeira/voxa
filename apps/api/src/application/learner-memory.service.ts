import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Session } from "../domain/conversation/types.js";
import { DomainError } from "../domain/errors.js";
import { daysBetween, type LearnerFact, type TutorMemory } from "../domain/memory/learner-fact.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { LEARNER_MEMORY_REPOSITORY, type LearnerMemoryRepository } from "../domain/ports/learner-memory.repository.js";
import { MEMORY_EXTRACTOR_PORT, type MemoryExtractorPort } from "../domain/ports/memory-extractor.port.js";
import { SESSION_REPOSITORY, type SessionRepository } from "../domain/ports/session.repository.js";

export class LearnerFactNotFoundError extends DomainError {
  readonly code = "not_found";

  constructor(id: string) {
    super(`Learner fact ${id} not found.`, "This fact no longer exists.");
  }
}

/** How many unremembered sessions one sweep picks up. */
const SWEEP_LIMIT = 5;

/** How many earlier sessions the tutor recalls (decided with the user on 2026-11-07). */
export const RECALLED_SESSIONS = 3;

/** Remembers what the learner says about themselves, so later sessions can bring it up. */
@Injectable()
export class LearnerMemoryService {
  private readonly logger = new Logger(LearnerMemoryService.name);
  /**
   * Runs one session at a time: each run reads the facts the one before saved, so two sessions never add
   * the same fact, and two ends of one session never call Claude twice.
   */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(LEARNER_MEMORY_REPOSITORY) private readonly memory: LearnerMemoryRepository,
    @Inject(MEMORY_EXTRACTOR_PORT) private readonly extractor: MemoryExtractorPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Saves what an ended session taught about the learner, once. Does nothing for a session still going. */
  async remember(sessionId: string): Promise<void> {
    const session = await this.sessions.get(sessionId);
    if (!session?.endedAt || (await this.memory.remembered(sessionId))) return;
    const turns = await this.sessions.history(sessionId);
    const known = await this.memory.facts();
    const memory = turns.some((t) => t.role === "user")
      ? await this.extractor.extract({ language: session.language, mode: session.mode, turns, known })
      : { recap: null, added: [], updated: [] };
    const saved = await this.memory.save(sessionId, session.language, memory, this.clock.now());
    if (saved) {
      this.logger.log(`memory session=${sessionId} added=${memory.added.length} updated=${memory.updated.length}`);
    }
  }

  /**
   * Queues `remember`, so the summary does not wait on it. Resolves when the run is done; never rejects:
   * a failure is logged and the session stays unremembered, for a later sweep.
   */
  rememberLater(sessionId: string): Promise<void> {
    const run = this.queue.then(() => this.remember(sessionId)).catch((error: unknown) => {
      this.logger.error(`memory failed session=${sessionId}: ${(error as Error).message}`, (error as Error).stack);
    });
    this.queue = run;
    return run;
  }

  /** Queues the ended sessions not remembered yet (Claude was down, or the API stopped mid-run). Never rejects. */
  async sweep(): Promise<void> {
    let ids: string[];
    try {
      ids = await this.memory.unremembered(SWEEP_LIMIT);
    } catch (error) {
      this.logger.error(`memory sweep failed: ${(error as Error).message}`, (error as Error).stack);
      return;
    }
    await Promise.all(ids.map((id) => this.rememberLater(id)));
  }

  /**
   * What the tutor knows when a session starts: every fact, and the last sessions started before it.
   * The session keeps this, so the tutor's prompt stays the same (and cached) all session.
   */
  async recall(session: Pick<Session, "startedAt">): Promise<TutorMemory> {
    const [facts, recent] = await Promise.all([
      this.memory.facts(),
      this.memory.recentSessions(RECALLED_SESSIONS, session.startedAt),
    ]);
    return {
      facts: facts.map(({ topic, statement }) => ({ topic, statement })),
      recentSessions: recent.map((s) => ({ mode: s.mode, daysAgo: daysBetween(s.startedAt, session.startedAt), recap: s.recap })),
    };
  }

  /** Every fact, oldest first: what the learner sees on "What Voxa knows about you". */
  facts(): Promise<LearnerFact[]> {
    return this.memory.facts();
  }

  async editFact(id: string, statement: string): Promise<LearnerFact> {
    const fact = await this.memory.editFact(id, statement, this.clock.now());
    if (!fact) throw new LearnerFactNotFoundError(id);
    return fact;
  }

  async deleteFact(id: string): Promise<void> {
    if (!(await this.memory.deleteFact(id))) throw new LearnerFactNotFoundError(id);
  }
}
