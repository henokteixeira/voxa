import { Inject, Injectable } from "@nestjs/common";
import { decide, isSerious, type TurnKind } from "../domain/conversation/correction-policy.js";
import type { Mode } from "../domain/conversation/mode.js";
import type { Session } from "../domain/conversation/types.js";
import { LEARNER_CONTEXT_PORT, type LearnerContextPort } from "../domain/ports/learner-context.port.js";
import { MISTAKE_REPOSITORY, type MistakeRepository, type SessionMistake } from "../domain/ports/mistake.repository.js";
import { SESSION_REPOSITORY, type SessionRepository } from "../domain/ports/session.repository.js";
import { TUTOR_PORT, type TutorPort } from "../domain/ports/tutor.port.js";

/** How many of the learner's most frequent mistakes the tutor watches for. */
export const KNOWN_MISTAKES_LIMIT = 20;

/** Speech-to-text output varies in case and end punctuation; ignore both when matching. */
function sameText(a: string, b: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[.,!?;:]+$/, "");
  return normalize(a) === normalize(b);
}

export class SessionNotFoundError extends Error {}
export class SessionEndedError extends Error {}

export interface TurnResult {
  kind: TurnKind;
  message: string;
  selfCorrected: boolean;
}

export interface SessionSummary {
  sessionId: string;
  mode: Mode;
  mistakes: SessionMistake[];
  selfCorrections: number;
}

@Injectable()
export class ConversationService {
  constructor(
    @Inject(TUTOR_PORT) private readonly tutor: TutorPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(MISTAKE_REPOSITORY) private readonly mistakes: MistakeRepository,
    @Inject(LEARNER_CONTEXT_PORT) private readonly learnerContext: LearnerContextPort,
  ) {}

  async start(mode: Mode, language: string): Promise<{ session: Session; message: string }> {
    const session = await this.sessions.create({ mode, language });
    const message = await this.tutor.open({ mode, language, learnerContext: await this.learnerContext.load() });
    await this.sessions.appendTurn(session.id, { role: "assistant", content: message });
    return { session, message };
  }

  async respond(sessionId: string, utterance: string): Promise<TurnResult> {
    const session = await this.openSession(sessionId);
    const [history, known, learnerContext] = await Promise.all([
      this.sessions.history(sessionId),
      this.mistakes.mostFrequent(session.language, KNOWN_MISTAKES_LIMIT),
      this.learnerContext.load(),
    ]);

    const verdict = await this.tutor.evaluate({
      mode: session.mode,
      language: session.language,
      learnerContext,
      history,
      pending: session.pending,
      knownMistakes: known.map(({ original, correction, category }) => ({ original, correction, category })),
      utterance,
    });
    const decision = decide(session.pending, verdict);

    // Every mistake goes to the bank, except a retry of the one already pending.
    const pending = session.pending;
    for (const issue of verdict.issues) {
      if (pending && (sameText(issue.correction, pending.correction) || sameText(issue.original, pending.original))) {
        continue;
      }
      await this.mistakes.record(
        { language: session.language, original: issue.original, correction: issue.correction, category: issue.category },
        { sessionId, severity: isSerious(issue) ? "serious" : "minor" },
      );
    }
    if (decision.selfCorrected && pending) {
      await this.mistakes.markSelfCorrected(sessionId, { language: session.language, original: pending.original });
    }

    await this.sessions.appendTurn(sessionId, { role: "user", content: utterance });
    await this.sessions.appendTurn(sessionId, { role: "assistant", content: decision.message });
    await this.sessions.setPending(sessionId, decision.nextPending);

    return { kind: decision.kind, message: decision.message, selfCorrected: decision.selfCorrected };
  }

  async end(sessionId: string): Promise<SessionSummary> {
    const session = await this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    if (!session.endedAt) await this.sessions.end(sessionId);
    const mistakes = await this.mistakes.forSession(sessionId);
    return {
      sessionId,
      mode: session.mode,
      mistakes,
      selfCorrections: mistakes.filter((m) => m.selfCorrected).length,
    };
  }

  private async openSession(sessionId: string): Promise<Session> {
    const session = await this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    if (session.endedAt) throw new SessionEndedError(sessionId);
    return session;
  }
}
