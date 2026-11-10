import { DomainError } from "../errors.js";

export class SessionNotFoundError extends DomainError {
  readonly code = "not_found";

  constructor(sessionId: string) {
    super(`Session ${sessionId} not found.`, "Session not found.");
  }
}

export class SessionEndedError extends DomainError {
  readonly code = "ended";

  constructor(sessionId: string) {
    super(`Session ${sessionId} has ended.`, "This session has ended.");
  }
}

/** Another turn of the session was saved while this one was being answered (two tabs, or a retry racing the first try). */
export class TurnConflictError extends DomainError {
  readonly code = "conflict";

  constructor(sessionId: string) {
    super(`Session ${sessionId} got another turn while this one was answered.`, "Voxa was still saving your last turn.");
  }
}
