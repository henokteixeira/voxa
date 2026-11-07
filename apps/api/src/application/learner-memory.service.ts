import { Inject, Injectable, Logger } from "@nestjs/common";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { LEARNER_MEMORY_REPOSITORY, type LearnerMemoryRepository } from "../domain/ports/learner-memory.repository.js";
import { MEMORY_EXTRACTOR_PORT, type MemoryExtractorPort } from "../domain/ports/memory-extractor.port.js";
import { SESSION_REPOSITORY, type SessionRepository } from "../domain/ports/session.repository.js";

/** Remembers what the learner says about themselves, so later sessions can bring it up. */
@Injectable()
export class LearnerMemoryService {
  private readonly logger = new Logger(LearnerMemoryService.name);

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
   * Runs `remember` in the background, so the summary does not wait on it. A failure is logged and the
   * session stays unremembered, so ending it again retries.
   */
  rememberLater(sessionId: string): void {
    this.remember(sessionId).catch((error: unknown) => {
      this.logger.error(`memory failed session=${sessionId}: ${(error as Error).message}`, (error as Error).stack);
    });
  }
}
