import { Injectable } from "@nestjs/common";
import type { SessionTiming } from "../domain/conversation/fluency.js";
import type { SignalComparison } from "../domain/progress/signal-trend.js";
import { ConversationService, type SessionSummary } from "./conversation.service.js";
import { ProgressService, type SessionXp } from "./progress.service.js";
import { SignalsService } from "./signals.service.js";

export type EndedSessionView = SessionSummary & { xp: SessionXp; comparison: SignalComparison | null };

/** Ends a session: its summary, the XP it earns and how its signals compare. Ending again returns the same. */
@Injectable()
export class SessionEndService {
  constructor(
    private readonly conversation: ConversationService,
    private readonly progress: ProgressService,
    private readonly signals: SignalsService,
  ) {}

  async end(sessionId: string, timing: SessionTiming | null): Promise<EndedSessionView> {
    const summary = await this.conversation.end(sessionId, timing);
    const [xp, comparison] = await Promise.all([this.award(summary), this.signals.recordSession(summary)]);
    return { ...summary, xp, comparison };
  }

  /**
   * Finishes a session the learner left (or whose end stopped half way) at `endsAt`, with the timing saved during
   * it. Its XP counts on that day. Its signals are not recorded: the history is in the order sessions are
   * recorded, and one closed hours later would come after sessions done since.
   */
  async close(sessionId: string, endsAt: Date): Promise<void> {
    await this.award(await this.conversation.end(sessionId, null, endsAt), endsAt);
  }

  private award(summary: SessionSummary, awardedAt?: Date): Promise<SessionXp> {
    return this.progress.awardSession({
      sessionId: summary.sessionId,
      goalsCovered: summary.goals.filter((goal) => goal.covered).length,
      selfCorrections: summary.selfCorrections,
      wordsPerMinute: summary.signals.wordsPerMinute,
      ...(awardedAt && { awardedAt }),
    });
  }
}
