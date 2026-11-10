import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { SESSION_REPOSITORY, type SessionRepository } from "../domain/ports/session.repository.js";
import { SessionEndService } from "./session-end.service.js";

/**
 * How long a session can sit with nothing done before it is closed: the web app's 2 hours to pick a session up
 * again after a reload, plus an hour so a session it can still resume is never closed under it.
 */
export const IDLE_SESSION_LIMIT_MS = 3 * 60 * 60 * 1000;
/** How often idle sessions are looked for. */
export const IDLE_CHECK_EVERY_MS = 30 * 60 * 1000;
/** Sessions closed per check, so a long backlog does not hold the tutor for long. */
const CLOSED_PER_CHECK = 20;

/**
 * Closes sessions the learner left open (the tab closed, another device, storage cleared): they end at their
 * last activity with the timing saved during the session, and earn their XP and signals like any other.
 */
@Injectable()
export class IdleSessionsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IdleSessionsService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;

  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    private readonly ending: SessionEndService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onApplicationBootstrap() {
    void this.closeIdle();
    this.timer = setInterval(() => void this.closeIdle(), IDLE_CHECK_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** How many sessions it closed. Never rejects: a session that fails to close is tried again next time. */
  closeIdle(): Promise<number> {
    // One check at a time: a slow one (the tutor summing up) is not run twice.
    this.running ??= this.closeAll().finally(() => (this.running = null));
    return this.running;
  }

  private async closeAll(): Promise<number> {
    let idle;
    try {
      idle = await this.sessions.idle(new Date(this.clock.now().getTime() - IDLE_SESSION_LIMIT_MS), CLOSED_PER_CHECK);
    } catch (error) {
      this.logger.error("Could not look for idle sessions", error instanceof Error ? error.stack : String(error));
      return 0;
    }
    let closed = 0;
    for (const session of idle) {
      try {
        await this.ending.end(session.id, null, session.lastActiveAt);
        closed++;
      } catch (error) {
        this.logger.warn(`Could not close idle session ${session.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (closed > 0) this.logger.log(`Closed ${closed} idle session(s)`);
    return closed;
  }
}
