import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { SESSION_REPOSITORY, type SessionRepository, type UnfinishedSession } from "../domain/ports/session.repository.js";
import { SessionEndService } from "./session-end.service.js";

/**
 * How long a session can sit with nothing done before it is closed: the web app's 2 hours to pick a session up
 * again after a reload, plus an hour of margin. A session counts as active while the web app runs it: it saves
 * the timing after each turn, every 5 minutes and when it picks the session up again.
 */
export const IDLE_SESSION_LIMIT_MS = 3 * 60 * 60 * 1000;
/** How often idle sessions are looked for. */
export const IDLE_CHECK_EVERY_MS = 30 * 60 * 1000;
/** How long an end that stopped half way (no XP) is tried again; older sessions are left as they are. */
export const UNFINISHED_RETRY_MS = 24 * 60 * 60 * 1000;
/** Sessions read at a time. */
const PAGE = 20;

/**
 * Closes sessions the learner left open (the tab closed, another device, storage cleared): they end at their
 * last activity with the timing saved during the session, and earn their XP on that day. Also finishes an end
 * that stopped before the XP was saved.
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
    const now = this.clock.now().getTime();
    const query = { idleBefore: new Date(now - IDLE_SESSION_LIMIT_MS), endedAfter: new Date(now - UNFINISHED_RETRY_MS), limit: PAGE };
    let closed = 0;
    let after: UnfinishedSession | undefined;
    try {
      // Page by page, so sessions that keep failing never hold back the others.
      for (;;) {
        const page = await this.sessions.unfinished({ ...query, after });
        for (const session of page) {
          try {
            await this.ending.close(session.id, session.endsAt);
            closed++;
          } catch (error) {
            this.logger.warn(`Could not close session ${session.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        if (page.length < PAGE) break;
        after = page.at(-1);
      }
    } catch (error) {
      this.logger.error("Could not look for idle sessions", error instanceof Error ? error.stack : String(error));
    }
    if (closed > 0) this.logger.log(`Closed ${closed} idle session(s)`);
    return closed;
  }
}
