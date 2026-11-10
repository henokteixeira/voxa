import { GOAL_DESCRIPTIONS, goalsFor } from "../domain/conversation/session-goals.js";
import type { Session } from "../domain/conversation/types.js";
import { SessionEndedError, SessionNotFoundError } from "../domain/conversation/session-errors.js";
import type { Mission } from "../domain/mission/mission.js";
import type { SessionRepository } from "../domain/ports/session.repository.js";
import type { TutorContext } from "../domain/ports/tutor.port.js";

/** The session, when it exists and has not ended. */
export async function openSession(sessions: Pick<SessionRepository, "get">, sessionId: string): Promise<Session> {
  const session = await sessions.get(sessionId);
  if (!session) throw new SessionNotFoundError(sessionId);
  if (session.endedAt) throw new SessionEndedError(sessionId);
  return session;
}

/** What the tutor knows about the session, for its opening line and every turn. */
export function tutorContext(session: Session, learnerContext: string, expressions?: string[]): TutorContext {
  return {
    ...(expressions?.length ? { expressions } : {}),
    mode: session.mode,
    language: session.language,
    learnerContext,
    memory: session.memory,
    goals: goalsFor(session.mode).map((id) => ({ id, description: GOAL_DESCRIPTIONS[id] })),
    targets: session.targets,
    step: session.step,
  };
}

/** The mission's expressions for the tutor to invite; none outside a mission or before its model. */
export function phrasesOf(mission: Mission | null): string[] | undefined {
  return mission?.model?.expressions.map((e) => e.phrase);
}
