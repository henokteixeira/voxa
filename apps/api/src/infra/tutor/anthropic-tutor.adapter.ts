import type Anthropic from "@anthropic-ai/sdk";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.js";
import { z } from "zod";
import type { TutorVerdict } from "../../domain/conversation/correction-policy.js";
import { MISTAKE_TYPES } from "../../domain/mistakes/mistake-type.js";
import {
  type SentenceHelp,
  type TrackPlan,
  type TutorContext,
  type TutorOpening,
  type TutorPort,
  type TutorRequest,
  TutorUnavailableError,
} from "../../domain/ports/tutor.port.js";
import { ClaudeClient } from "./claude-client.js";
import { buildHelpRequest, buildSystemPrompt, buildTrackInstruction, buildTurnMessage, OPENING_REQUEST } from "./tutor-prompts.js";

const OpeningSchema = z.object({ reply: z.string(), scaffold: z.string().nullable() });

const HelpSchema = z.object({ start: z.string(), words: z.array(z.object({ words: z.string(), meaning: z.string() })) });

/** At most this many key words reach the screen. */
const HELP_WORDS = 4;

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
  usedExpressions: z.array(z.string()),
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
  /** BCP 47. The tutor writes on-screen support in it. */
  private readonly firstLanguage: string;

  constructor(
    private readonly claude: ClaudeClient,
    config: ConfigService<Env, true>,
  ) {
    this.firstLanguage = config.get("LEARNER_FIRST_LANGUAGE", { infer: true });
  }

  async open(context: TutorContext, plan: TrackPlan | null = null): Promise<TutorOpening> {
    // Structured output: the system prompt describes the turn's JSON fields, and in plain text the model
    // sometimes answered the opening with that JSON, which was then shown and spoken as is.
    const opening = await this.claude.parse("tutor_open", {
      schema: OpeningSchema,
      maxTokens: 4000,
      system: this.system(context),
      // The guided track's first step goes with this request only: later turns replay the plain request.
      messages: [
        {
          role: "user",
          content: plan ? `${OPENING_REQUEST}\n<guided_track>\n${buildTrackInstruction(plan)}\n</guided_track>` : OPENING_REQUEST,
        },
      ],
    });
    const text = opening.reply.trim();
    if (!text) throw new TutorUnavailableError("The tutor returned an empty opening line.");
    return { line: text, scaffold: opening.scaffold?.trim() || null };
  }

  async evaluate(request: TutorRequest, onReply?: (reply: string) => void): Promise<TutorVerdict> {
    let handed = false;
    // `reply` is the schema's first field: it can be spoken while the model writes the analysis.
    const onText = onReply
      ? (snapshot: string) => {
          if (handed) return;
          const reply = leadingReply(snapshot);
          if (reply === null) return;
          handed = true;
          onReply(reply);
        }
      : undefined;
    return this.claude.stream(
      "tutor_turn",
      {
        schema: VerdictSchema,
        maxTokens: 8000,
        system: this.system(request),
        messages: [
          { role: "user", content: OPENING_REQUEST },
          ...cachedHistory(request.history),
          { role: "user", content: [{ type: "text", text: buildTurnMessage(request) }] },
        ],
      },
      onText,
    );
  }

  async help(context: TutorContext, history: TutorRequest["history"]): Promise<SentenceHelp> {
    const help = await this.claude.parse("tutor_help", {
      schema: HelpSchema,
      maxTokens: 2000,
      system: this.system(context),
      messages: [
        { role: "user", content: OPENING_REQUEST },
        ...cachedHistory(history),
        { role: "user", content: buildHelpRequest(this.firstLanguage) },
      ],
    });
    const start = help.start.trim();
    if (!start) throw new TutorUnavailableError("The tutor returned no help.");
    const words = help.words
      .map((w) => ({ words: w.words.trim(), meaning: w.meaning.trim() }))
      .filter((w) => w.words && w.meaning)
      .slice(0, HELP_WORDS);
    return { start, words };
  }

  private system(context: TutorContext): Anthropic.TextBlockParam[] {
    return [{ type: "text", text: buildSystemPrompt(context, this.firstLanguage), cache_control: { type: "ephemeral" } }];
  }
}
