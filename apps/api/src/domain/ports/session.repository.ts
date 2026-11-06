import type { Mode } from "../conversation/mode.js";
import type { ChatTurn, PendingCorrection, Session } from "../conversation/types.js";

export interface SessionRepository {
  create(input: { language: string; mode: Mode }): Promise<Session>;
  get(id: string): Promise<Session | null>;
  appendTurn(sessionId: string, turn: ChatTurn): Promise<void>;
  history(sessionId: string): Promise<ChatTurn[]>;
  setPending(sessionId: string, pending: PendingCorrection | null): Promise<void>;
  end(sessionId: string): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");
