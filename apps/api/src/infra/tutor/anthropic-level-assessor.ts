import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { ChatTurn } from "../../domain/conversation/types.js";
import { CEFR_LEVELS } from "../../domain/level/speaking-level.js";
import type { LevelAssessment, LevelAssessorPort } from "../../domain/ports/level-assessor.port.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { ANTHROPIC_CLIENT, type AnthropicMessages } from "./anthropic-tutor.adapter.js";
import { buildAssessmentPrompt, buildTranscript } from "./level-prompts.js";

const AssessmentSchema = z.object({
  level: z.enum(CEFR_LEVELS),
  evidence: z.array(z.string()),
});

/** How many lines of evidence the Progress tab shows. */
const MAX_EVIDENCE = 3;

/** Speech-to-text output varies in case and spacing; compare loosely so a quote still counts as the learner's. */
const loose = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, " ").trim();

/** Evidence shorter than this is a fragment, not a line that shows a level. */
const MIN_EVIDENCE_WORDS = 3;

/** True when `quote` is a run of whole words from one of the learner's lines. */
function saidByLearner(quote: string, lines: string[]): boolean {
  const q = loose(quote);
  if (q.split(" ").length < MIN_EVIDENCE_WORDS) return false;
  return lines.some((line) => ` ${line} `.includes(` ${q} `));
}

@Injectable()
export class AnthropicLevelAssessor implements LevelAssessorPort {
  private readonly logger = new Logger(AnthropicLevelAssessor.name);
  private readonly model: string;

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly messages: AnthropicMessages,
    config: ConfigService,
  ) {
    this.model = config.get<string>("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
  }

  async assess({ language, turns }: { language: string; turns: ChatTurn[] }): Promise<LevelAssessment> {
    let response;
    try {
      response = await this.messages.parse({
        model: this.model,
        max_tokens: 4000,
        // Runs once, after the interview: worth more thought than a spoken turn.
        output_config: { effort: "medium", format: zodOutputFormat(AssessmentSchema) },
        system: buildAssessmentPrompt(language),
        messages: [{ role: "user", content: `<transcript>\n${buildTranscript(turns)}\n</transcript>` }],
      });
    } catch (error) {
      throw new TutorUnavailableError(`Claude API request failed: ${(error as Error).message}`, { cause: error });
    }
    if (response.usage) {
      this.logger.log(`tutor usage call=assess input=${response.usage.input_tokens} output=${response.usage.output_tokens}`);
    }
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !response.parsed_output) {
      throw new TutorUnavailableError("The level assessment did not complete.");
    }
    // Only the learner's own lines count as evidence.
    const said = turns.filter((t) => t.role === "user").map((t) => loose(t.content));
    const evidence = response.parsed_output.evidence
      .map((e) => e.trim())
      .filter((e) => saidByLearner(e, said))
      .slice(0, MAX_EVIDENCE);
    return { level: response.parsed_output.level, evidence };
  }
}
