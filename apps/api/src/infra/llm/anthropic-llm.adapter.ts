import Anthropic from "@anthropic-ai/sdk";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ChatTurn, LlmPort } from "../../domain/ports/llm.port.js";

@Injectable()
export class AnthropicLlmAdapter implements LlmPort {
  private readonly client = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente
  private readonly model: string;

  constructor(config: ConfigService) {
    this.model = config.get<string>("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
  }

  async reply(system: string, history: ChatTurn[]): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      // Conversa rápida: esforço baixo reduz latência e custo.
      output_config: { effort: "low" },
      system,
      messages: history,
    });
    if (response.stop_reason === "refusal") {
      throw new Error(`Resposta recusada pelo modelo: ${response.stop_details?.category ?? "sem categoria"}`);
    }
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
}
