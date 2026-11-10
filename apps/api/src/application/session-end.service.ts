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

  async end(sessionId: string, timing: SessionTiming | null, endedAt?: Date): Promise<EndedSessionView> {
    const summary = await this.conversation.end(sessionId, timing, endedAt);
    const [xp, comparison] = await Promise.all([
      this.progress.awardSession({
        sessionId,
        goalsCovered: summary.goals.filter((goal) => goal.covered).length,
        selfCorrections: summary.selfCorrections,
        wordsPerMinute: summary.signals.wordsPerMinute,
      }),
      this.signals.recordSession(summary),
    ]);
    return { ...summary, xp, comparison };
  }
}
