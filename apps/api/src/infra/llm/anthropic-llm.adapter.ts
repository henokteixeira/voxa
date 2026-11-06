import Anthropic from "@anthropic-ai/sdk";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ChatTurn, LlmPort } from "../../domain/ports/llm.port.js";

@Injectable()
export class AnthropicLlmAdapter implements LlmPort {
  private readonly client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  private readonly model: string;

  constructor(config: ConfigService) {
    this.model = config.get<string>("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
  }

  async reply(system: string, history: ChatTurn[]): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      // Fast conversation: low effort reduces latency and cost.
      output_config: { effort: "low" },
      system,
      messages: history,
    });
    if (response.stop_reason === "refusal") {
      throw new Error(`Model refused to respond: ${response.stop_details?.category ?? "no category"}`);
    }
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
}
