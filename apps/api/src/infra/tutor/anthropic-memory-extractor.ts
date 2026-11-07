import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { ChatTurn } from "../../domain/conversation/types.js";
import type { Mode } from "../../domain/conversation/mode.js";
import { cleanMemory, FACT_TOPICS, type LearnerFact, type SessionMemory } from "../../domain/memory/learner-fact.js";
import type { MemoryExtractorPort } from "../../domain/ports/memory-extractor.port.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { ANTHROPIC_CLIENT, type AnthropicMessages } from "./anthropic-tutor.adapter.js";
import { buildMemoryMessage, buildMemoryPrompt } from "./memory-prompts.js";

const MemorySchema = z.object({
  recap: z.string().nullable(),
  added: z.array(z.object({ topic: z.enum(FACT_TOPICS), statement: z.string() })),
  updated: z.array(z.object({ id: z.string(), statement: z.string() })),
});

@Injectable()
export class AnthropicMemoryExtractor implements MemoryExtractorPort {
  private readonly logger = new Logger(AnthropicMemoryExtractor.name);
  private readonly model: string;

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly messages: AnthropicMessages,
    config: ConfigService<Env, true>,
  ) {
    this.model = config.get("ANTHROPIC_MODEL", { infer: true });
  }

  async extract({ mode, turns, known }: { language: string; mode: Mode; turns: ChatTurn[]; known: LearnerFact[] }): Promise<SessionMemory> {
    let response;
    try {
      response = await this.messages.parse({
        model: this.model,
        max_tokens: 2000,
        // Runs once, after the session, off the voice path: low effort is enough to pick out facts.
        output_config: { effort: "low", format: zodOutputFormat(MemorySchema) },
        system: buildMemoryPrompt(),
        messages: [{ role: "user", content: buildMemoryMessage(mode, turns, known) }],
      });
    } catch (error) {
      throw new TutorUnavailableError(`Claude API request failed: ${(error as Error).message}`, { cause: error });
    }
    if (response.usage) {
      this.logger.log(`tutor usage call=memory input=${response.usage.input_tokens} output=${response.usage.output_tokens}`);
    }
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !response.parsed_output) {
      throw new TutorUnavailableError("The memory extraction did not complete.");
    }
    return cleanMemory(response.parsed_output, new Set(known.map((f) => f.id)));
  }
}
