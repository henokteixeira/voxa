import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { z } from "zod";
import type { ClaudeTask, Effort, Env } from "../../config/env.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";

export const ANTHROPIC_CLIENT = Symbol("ANTHROPIC_CLIENT");

/** The subset of the SDK the client uses, so tests can pass a fake. */
export type AnthropicMessages = Pick<Anthropic["messages"], "create" | "parse" | "stream">;

/** A live conversation can't wait the SDK's default 10 minutes: fail fast and show an error state. */
export const CLAUDE_TIMEOUT_MS = 30_000;

/** Reads ANTHROPIC_API_KEY from the environment. */
export const anthropicClientProvider = {
  provide: ANTHROPIC_CLIENT,
  useFactory: (): AnthropicMessages => new Anthropic({ timeout: CLAUDE_TIMEOUT_MS, maxRetries: 1 }).messages,
};

/** The effort each task uses unless ANTHROPIC_TASKS says otherwise; the rest use ANTHROPIC_EFFORT. */
const DEFAULT_EFFORTS: Partial<Record<ClaudeTask, Effort>> = {
  // Once, after the session, off the voice path: low effort is enough to pick out facts.
  memory: "low",
  // Once every 2 weeks, or once after the interview: worth more thought than a spoken turn.
  check_in: "medium",
  assess: "medium",
};

export interface ClaudeRequest<T> {
  schema: z.ZodType<T>;
  system: string | Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  maxTokens: number;
}

/**
 * The one way the API calls Claude: picks the task's model and effort, asks for structured output, logs the
 * tokens of every call and turns every failure (network, refusal, cut-off, output off the schema) into
 * TutorUnavailableError.
 */
@Injectable()
export class ClaudeClient {
  private readonly logger = new Logger(ClaudeClient.name);
  private readonly config: Pick<Env, "ANTHROPIC_MODEL" | "ANTHROPIC_EFFORT" | "ANTHROPIC_TASKS">;

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly messages: AnthropicMessages,
    config: ConfigService<Env, true>,
  ) {
    this.config = {
      ANTHROPIC_MODEL: config.get("ANTHROPIC_MODEL", { infer: true }),
      ANTHROPIC_EFFORT: config.get("ANTHROPIC_EFFORT", { infer: true }),
      ANTHROPIC_TASKS: config.get("ANTHROPIC_TASKS", { infer: true }),
    };
  }

  /** The model and effort a task runs with. */
  settings(task: ClaudeTask): { model: string; effort: Effort } {
    const override = this.config.ANTHROPIC_TASKS[task];
    return {
      model: override?.model ?? this.config.ANTHROPIC_MODEL,
      effort: override?.effort ?? DEFAULT_EFFORTS[task] ?? this.config.ANTHROPIC_EFFORT,
    };
  }

  /** One call; resolves to the answer, already checked against the schema. */
  async parse<T>(task: ClaudeTask, request: ClaudeRequest<T>): Promise<T> {
    return this.call(task, () => this.messages.parse(this.params(task, request)));
  }

  /**
   * One streamed call. `onText` gets the answer's JSON as written so far, to act on its first field before the
   * rest is done. The client's timeout stops at the response headers, so a stalled stream is aborted too.
   */
  async stream<T>(task: ClaudeTask, request: ClaudeRequest<T>, onText?: (snapshot: string) => void): Promise<T> {
    return this.call(task, () => {
      const stream = this.messages.stream(this.params(task, request), { signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS) });
      if (onText) stream.on("text", (_delta, snapshot) => onText(snapshot));
      return stream.finalMessage();
    });
  }

  private params<T>(task: ClaudeTask, { schema, system, messages, maxTokens }: ClaudeRequest<T>) {
    const { model, effort } = this.settings(task);
    return {
      model,
      max_tokens: maxTokens,
      output_config: { effort, format: zodOutputFormat(schema) },
      system,
      messages,
    };
  }

  private async call<T>(
    task: ClaudeTask,
    send: () => Promise<{ stop_reason: Anthropic.StopReason | null; usage?: Anthropic.Usage; parsed_output?: unknown }>,
  ): Promise<T> {
    let response;
    try {
      response = await send();
    } catch (error) {
      throw new TutorUnavailableError(`Claude API request failed (${task}): ${(error as Error).message}`, { cause: error });
    }
    const { usage } = response;
    if (usage) {
      this.logger.log(
        `tutor usage call=${task} input=${usage.input_tokens} cache_read=${usage.cache_read_input_tokens ?? 0} ` +
          `cache_write=${usage.cache_creation_input_tokens ?? 0} output=${usage.output_tokens}`,
      );
    }
    if (response.stop_reason === "refusal") throw new TutorUnavailableError(`The model declined to answer (${task}).`);
    if (response.stop_reason === "max_tokens" || response.stop_reason === "model_context_window_exceeded") {
      throw new TutorUnavailableError(`The answer was cut off (${task}).`);
    }
    if (response.parsed_output === null || response.parsed_output === undefined) {
      throw new TutorUnavailableError(`The answer did not match the schema (${task}).`);
    }
    return response.parsed_output as T;
  }
}
