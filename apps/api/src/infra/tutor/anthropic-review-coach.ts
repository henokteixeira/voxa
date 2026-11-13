import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { ReviewCheck, ReviewCoachPort, ReviewCue } from "../../domain/ports/review-coach.port.js";
import type { ReviewItem } from "../../domain/ports/review.repository.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { ClaudeClient } from "./claude-client.js";
import { buildCheckMessage, buildCheckPrompt, buildCueMessage, buildCuePrompt } from "./review-prompts.js";

const CueSchema = z.object({ cue: z.string(), answer: z.string() });
const CheckSchema = z.object({ recalled: z.boolean(), otherMistake: z.string().nullable() });

@Injectable()
export class AnthropicReviewCoach implements ReviewCoachPort {
  private readonly firstLanguage: string;

  constructor(
    private readonly claude: ClaudeClient,
    config: ConfigService<Env, true>,
  ) {
    this.firstLanguage = config.get("LEARNER_FIRST_LANGUAGE", { infer: true });
  }

  async cue(item: ReviewItem, learnerContext: string): Promise<ReviewCue> {
    const cue = await this.ask("review_cue", CueSchema, buildCuePrompt(item.language, this.firstLanguage), buildCueMessage(item, learnerContext));
    const text = { cue: cue.cue.trim(), answer: cue.answer.trim() };
    if (!text.cue || !text.answer) throw new TutorUnavailableError("The review cue came back empty.");
    return text;
  }

  async check(item: ReviewItem, cue: ReviewCue, utterance: string): Promise<ReviewCheck> {
    const prompt = buildCheckPrompt(item.language, this.firstLanguage);
    const result = await this.ask("review_check", CheckSchema, prompt, buildCheckMessage(item, cue, utterance));
    const otherMistake = result.otherMistake?.trim() || null;
    // Another mistake means the answer is not whole yet, whatever the flag says.
    return { recalled: result.recalled && otherMistake === null, otherMistake };
  }

  private ask<T>(task: "review_cue" | "review_check", schema: z.ZodType<T>, system: string, content: string): Promise<T> {
    return this.claude.parse(task, { schema, system, maxTokens: 2000, messages: [{ role: "user", content }] });
  }
}
