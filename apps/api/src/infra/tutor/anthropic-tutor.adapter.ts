import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { TutorVerdict } from "../../domain/conversation/correction-policy.js";
import { type TutorContext, type TutorPort, type TutorRequest, TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { buildSystemPrompt, buildTurnMessage, OPENING_REQUEST } from "./tutor-prompts.js";

export const ANTHROPIC_CLIENT = Symbol("ANTHROPIC_CLIENT");

/** The subset of the SDK the adapter uses, so tests can pass a fake. */
export type AnthropicMessages = Pick<Anthropic["messages"], "create" | "parse">;

/** A live conversation can't wait the SDK's default 10 minutes: fail fast and show an error state. */
const TUTOR_TIMEOUT_MS = 30_000;

/** Reads ANTHROPIC_API_KEY from the environment. */
export const anthropicClientProvider = {
  provide: ANTHROPIC_CLIENT,
  useFactory: (): AnthropicMessages => new Anthropic({ timeout: TUTOR_TIMEOUT_MS, maxRetries: 1 }).messages,
};

const VerdictSchema = z.object({
  reply: z.string(),
  issues: z.array(
    z.object({
      original: z.string(),
      correction: z.string(),
      category: z.string(),
      severity: z.enum(["serious", "minor"]),
      hint: z.string(),
      matchesKnownMistake: z.boolean(),
    }),
  ),
  pendingResolved: z.boolean(),
  nextHint: z.string().nullable(),
  correctUses: z.array(z.string()),
});

type Effort = "low" | "medium" | "high";

@Injectable()
export class AnthropicTutorAdapter implements TutorPort {
  private readonly model: string;
  private readonly effort: Effort;

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly messages: AnthropicMessages,
    config: ConfigService,
  ) {
    this.model = config.get<string>("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
    const effort = config.get<string>("ANTHROPIC_EFFORT");
    // Low effort keeps spoken turns fast; raise it if the tutor misses mistakes.
    this.effort = effort === "medium" || effort === "high" ? effort : "low";
  }

  async open(context: TutorContext): Promise<string> {
    const response = await this.call(() =>
      this.messages.create({
        model: this.model,
        max_tokens: 4000,
        output_config: { effort: this.effort },
        system: this.system(context),
        messages: [{ role: "user", content: OPENING_REQUEST }],
      }),
    );
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) throw new TutorUnavailableError("The tutor returned an empty opening line.");
    return text;
  }

  async evaluate(request: TutorRequest): Promise<TutorVerdict> {
    const response = await this.call(() =>
      this.messages.parse({
        model: this.model,
        max_tokens: 8000,
        output_config: { effort: this.effort, format: zodOutputFormat(VerdictSchema) },
        system: this.system(request),
        messages: [
          { role: "user", content: OPENING_REQUEST },
          ...request.history.map((t) => ({ role: t.role, content: t.content })),
          // Cache the conversation so far: each turn only pays for the new part.
          {
            role: "user",
            content: [{ type: "text", text: buildTurnMessage(request), cache_control: { type: "ephemeral" } }],
          },
        ],
      }),
    );
    if (!response.parsed_output) throw new TutorUnavailableError("The tutor's answer did not match the schema.");
    return response.parsed_output;
  }

  private system(context: TutorContext): Anthropic.TextBlockParam[] {
    return [{ type: "text", text: buildSystemPrompt(context), cache_control: { type: "ephemeral" } }];
  }

  private async call<T extends { stop_reason: Anthropic.StopReason | null }>(send: () => Promise<T>): Promise<T> {
    let response: T;
    try {
      response = await send();
    } catch (error) {
      throw new TutorUnavailableError(`Claude API request failed: ${(error as Error).message}`, { cause: error });
    }
    if (response.stop_reason === "refusal") throw new TutorUnavailableError("The model declined to answer.");
    if (response.stop_reason === "max_tokens" || response.stop_reason === "model_context_window_exceeded") throw new TutorUnavailableError("The tutor's answer was cut off.");
    return response;
  }
}
