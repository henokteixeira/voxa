import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.js";
import { z } from "zod";
import type { TutorVerdict } from "../../domain/conversation/correction-policy.js";
import { MISTAKE_TYPES } from "../../domain/mistakes/mistake-type.js";
import {
  type TrackPlan,
  type TutorContext,
  type TutorOpening,
  type TutorPort,
  type TutorRequest,
  TutorUnavailableError,
} from "../../domain/ports/tutor.port.js";
import { buildSystemPrompt, buildTrackInstruction, buildTurnMessage, OPENING_REQUEST } from "./tutor-prompts.js";

export const ANTHROPIC_CLIENT = Symbol("ANTHROPIC_CLIENT");

/** The subset of the SDK the adapter uses, so tests can pass a fake. */
export type AnthropicMessages = Pick<Anthropic["messages"], "create" | "parse" | "stream">;

/** A live conversation can't wait the SDK's default 10 minutes: fail fast and show an error state. */
const TUTOR_TIMEOUT_MS = 30_000;

/** Reads ANTHROPIC_API_KEY from the environment. */
export const anthropicClientProvider = {
  provide: ANTHROPIC_CLIENT,
  useFactory: (): AnthropicMessages => new Anthropic({ timeout: TUTOR_TIMEOUT_MS, maxRetries: 1 }).messages,
};

const OpeningSchema = z.object({ reply: z.string(), scaffold: z.string().nullable() });

const VerdictSchema = z.object({
  reply: z.string(),
  issues: z.array(
    z.object({
      original: z.string(),
      correction: z.string(),
      category: z.enum(MISTAKE_TYPES),
      severity: z.enum(["serious", "minor"]),
      hint: z.string(),
      matchesKnownMistake: z.boolean(),
      pattern: z.object({ key: z.string(), name: z.string(), rule: z.string() }),
    }),
  ),
  pendingResolved: z.boolean(),
  nextHint: z.string().nullable(),
  correctUses: z.array(z.string()),
  newWords: z.array(z.object({ said: z.string(), words: z.string() })),
  support: z.string().nullable(),
  coveredGoals: z.array(z.string()),
  stuck: z.boolean(),
  scaffold: z.string().nullable(),
});

/** The `reply` string at the start of a partial JSON answer, once its closing quote is written; else null. */
export function leadingReply(partialJson: string): string | null {
  const match = /^\s*\{\s*"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(partialJson);
  if (!match) return null;
  try {
    const reply = (JSON.parse(`"${match[1]}"`) as string).trim();
    return reply || null;
  } catch {
    return null;
  }
}

type Effort = Env["ANTHROPIC_EFFORT"];

/**
 * The saved turns, with a cache breakpoint on the last one. They are sent the same way on every turn, so the
 * next turn reads them from the cache and pays full price only for what is new. The turn message is not cached:
 * it carries this turn's lists and the next request replays the learner's words without them.
 */
function cachedHistory(history: TutorRequest["history"]): Anthropic.MessageParam[] {
  return history.map((turn, i) =>
    i === history.length - 1
      ? { role: turn.role, content: [{ type: "text", text: turn.content, cache_control: { type: "ephemeral" } }] }
      : { role: turn.role, content: turn.content },
  );
}

@Injectable()
export class AnthropicTutorAdapter implements TutorPort {
  private readonly logger = new Logger(AnthropicTutorAdapter.name);
  private readonly model: string;
  private readonly effort: Effort;
  /** BCP 47. The tutor writes on-screen support in it. */
  private readonly firstLanguage: string;

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly messages: AnthropicMessages,
    config: ConfigService<Env, true>,
  ) {
    this.model = config.get("ANTHROPIC_MODEL", { infer: true });
    // Low effort (the default) keeps spoken turns fast; raise it if the tutor misses mistakes.
    this.effort = config.get("ANTHROPIC_EFFORT", { infer: true });
    this.firstLanguage = config.get("LEARNER_FIRST_LANGUAGE", { infer: true });
  }

  async open(context: TutorContext, plan: TrackPlan | null = null): Promise<TutorOpening> {
    // Structured output: the system prompt describes the turn's JSON fields, and in plain text the model
    // sometimes answered the opening with that JSON, which was then shown and spoken as is.
    const response = await this.call("open", () =>
      this.messages.parse({
        model: this.model,
        max_tokens: 4000,
        output_config: { effort: this.effort, format: zodOutputFormat(OpeningSchema) },
        system: this.system(context),
        // The guided track's first step goes with this request only: later turns replay the plain request.
        messages: [
          {
            role: "user",
            content: plan
              ? `${OPENING_REQUEST}\n<guided_track>\n${buildTrackInstruction(plan)}\n</guided_track>`
              : OPENING_REQUEST,
          },
        ],
      }),
    );
    const text = response.parsed_output?.reply.trim();
    if (!text) throw new TutorUnavailableError("The tutor returned an empty opening line.");
    return { line: text, scaffold: response.parsed_output?.scaffold?.trim() || null };
  }

  async evaluate(request: TutorRequest, onReply?: (reply: string) => void): Promise<TutorVerdict> {
    const response = await this.call("evaluate", () => {
      const stream = this.messages.stream(
        {
          model: this.model,
          max_tokens: 8000,
          output_config: { effort: this.effort, format: zodOutputFormat(VerdictSchema) },
          system: this.system(request),
          messages: [
            { role: "user", content: OPENING_REQUEST },
            ...cachedHistory(request.history),
            { role: "user", content: [{ type: "text", text: buildTurnMessage(request) }] },
          ],
        },
        // The client's timeout stops at the response headers; a stalled stream must fail fast too.
        { signal: AbortSignal.timeout(TUTOR_TIMEOUT_MS) },
      );
      // `reply` is the schema's first field: it can be spoken while the model writes the analysis.
      if (onReply) {
        let handed = false;
        stream.on("text", (_delta, snapshot) => {
          if (handed) return;
          const reply = leadingReply(snapshot);
          if (reply === null) return;
          handed = true;
          onReply(reply);
        });
      }
      return stream.finalMessage();
    });
    if (!response.parsed_output) throw new TutorUnavailableError("The tutor's answer did not match the schema.");
    return response.parsed_output;
  }

  private system(context: TutorContext): Anthropic.TextBlockParam[] {
    return [{ type: "text", text: buildSystemPrompt(context, this.firstLanguage), cache_control: { type: "ephemeral" } }];
  }

  private async call<T extends { stop_reason: Anthropic.StopReason | null; usage?: Anthropic.Usage }>(
    name: string,
    send: () => Promise<T>,
  ): Promise<T> {
    let response: T;
    try {
      response = await send();
    } catch (error) {
      throw new TutorUnavailableError(`Claude API request failed: ${(error as Error).message}`, { cause: error });
    }
    // Tokens per call, to measure the cost of a turn.
    const usage = response.usage;
    if (usage) {
      this.logger.log(
        `tutor usage call=${name} input=${usage.input_tokens} cache_read=${usage.cache_read_input_tokens ?? 0} ` +
          `cache_write=${usage.cache_creation_input_tokens ?? 0} output=${usage.output_tokens}`,
      );
    }
    if (response.stop_reason === "refusal") throw new TutorUnavailableError("The model declined to answer.");
    if (response.stop_reason === "max_tokens" || response.stop_reason === "model_context_window_exceeded") throw new TutorUnavailableError("The tutor's answer was cut off.");
    return response;
  }
}
