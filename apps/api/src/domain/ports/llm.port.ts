/** Conversation message, independent of the AI provider. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface LlmPort {
  /** Generates the tutor's next line from the history and the system prompt. */
  reply(system: string, history: ChatTurn[]): Promise<string>;
}

export const LLM_PORT = Symbol("LLM_PORT");
