import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { ReviewCoachPort, ReviewCue } from "../../domain/ports/review-coach.port.js";
import type { ReviewItem } from "../../domain/ports/review.repository.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { ANTHROPIC_CLIENT, type AnthropicMessages } from "./anthropic-tutor.adapter.js";
import { buildCheckMessage, buildCheckPrompt, buildCueMessage, buildCuePrompt } from "./review-prompts.js";

const CueSchema = z.object({ cue: z.string(), answer: z.string() });
const CheckSchema = z.object({ recalled: z.boolean() });

@Injectable()
export class AnthropicReviewCoach implements ReviewCoachPort {
  private readonly logger = new Logger(AnthropicReviewCoach.name);
  private readonly model: string;
  private readonly effort: Env["ANTHROPIC_EFFORT"];
  private readonly firstLanguage: string;

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly messages: AnthropicMessages,
    config: ConfigService<Env, true>,
  ) {
    this.model = config.get("ANTHROPIC_MODEL", { infer: true });
    this.effort = config.get("ANTHROPIC_EFFORT", { infer: true });
    this.firstLanguage = config.get("LEARNER_FIRST_LANGUAGE", { infer: true });
  }

  async cue(item: ReviewItem, learnerContext: string): Promise<ReviewCue> {
    const cue = await this.ask("review_cue", CueSchema, buildCuePrompt(item.language, this.firstLanguage), buildCueMessage(item, learnerContext));
    const text = { cue: cue.cue.trim(), answer: cue.answer.trim() };
    if (!text.cue || !text.answer) throw new TutorUnavailableError("The review cue came back empty.");
    return text;
  }

  async check(item: ReviewItem, cue: ReviewCue, utterance: string): Promise<boolean> {
    const result = await this.ask("review_check", CheckSchema, buildCheckPrompt(item.language), buildCheckMessage(item, cue, utterance));
    return result.recalled;
  }

  private async ask<T>(name: string, schema: z.ZodType<T>, system: string, content: string): Promise<T> {
    let response;
    try {
      response = await this.messages.parse({
        model: this.model,
        max_tokens: 2000,
        output_config: { effort: this.effort, format: zodOutputFormat(schema) },
        system,
        messages: [{ role: "user", content }],
      });
    } catch (error) {
      throw new TutorUnavailableError(`Claude API request failed: ${(error as Error).message}`, { cause: error });
    }
    if (response.usage) {
      this.logger.log(`tutor usage call=${name} input=${response.usage.input_tokens} output=${response.usage.output_tokens}`);
    }
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !response.parsed_output) {
      throw new TutorUnavailableError(`The ${name.replace("_", " ")} did not complete.`);
    }
    return response.parsed_output as T;
  }
}
