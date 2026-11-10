import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { ChatTurn } from "../../domain/conversation/types.js";
import type { Mode } from "../../domain/conversation/mode.js";
import { cleanMemory, FACT_TOPICS, type LearnerFact, type SessionMemory } from "../../domain/memory/learner-fact.js";
import type { MemoryExtractorPort } from "../../domain/ports/memory-extractor.port.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { ClaudeClient } from "./claude-client.js";
import { buildMemoryMessage, buildMemoryPrompt } from "./memory-prompts.js";

const MemorySchema = z.object({
  recap: z.string().nullable(),
  added: z.array(z.object({ topic: z.enum(FACT_TOPICS), statement: z.string() })),
  updated: z.array(z.object({ id: z.string(), statement: z.string() })),
});

@Injectable()
export class AnthropicMemoryExtractor implements MemoryExtractorPort {
  constructor(private readonly claude: ClaudeClient) {}

  async extract({ mode, turns, known }: { language: string; mode: Mode; turns: ChatTurn[]; known: LearnerFact[] }): Promise<SessionMemory> {
    const memory = await this.claude.parse("memory", {
      schema: MemorySchema,
      maxTokens: 2000,
      system: buildMemoryPrompt(),
      messages: [{ role: "user", content: buildMemoryMessage(mode, turns, known) }],
    });
    return cleanMemory(memory, new Set(known.map((f) => f.id)));
  }
}
