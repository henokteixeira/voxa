/** Mensagem de conversa independente de fornecedor de IA. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface LlmPort {
  /** Gera a próxima fala do tutor a partir do histórico e do prompt de sistema. */
  reply(system: string, history: ChatTurn[]): Promise<string>;
}

export const LLM_PORT = Symbol("LLM_PORT");
