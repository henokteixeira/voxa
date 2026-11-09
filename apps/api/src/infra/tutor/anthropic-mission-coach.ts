import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { MISSION_EXPRESSIONS, type MissionModel } from "../../domain/mission/mission.js";
import type { MissionCoachPort, ModelRequest } from "../../domain/ports/mission-coach.port.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { ANTHROPIC_CLIENT, type AnthropicMessages } from "./anthropic-tutor.adapter.js";
import { buildModelMessage, buildModelPrompt } from "./mission-prompts.js";

/** About a minute and a half of speech at most; the voice engine takes up to 2000 characters. */
export const MAX_MODEL_CHARS = 1500;
/** Even the shortest model (about 70 words at A1) is longer than this: a shorter one shows nothing to learn from. */
export const MIN_MODEL_CHARS = 200;

const squash = (text: string) => text.replace(/\s+/g, " ").toLowerCase();

const ModelSchema = z.object({
  speaker: z.string(),
  text: z.string(),
  expressions: z.array(z.object({ phrase: z.string(), example: z.string() })),
});

@Injectable()
export class AnthropicMissionCoach implements MissionCoachPort {
  private readonly logger = new Logger(AnthropicMissionCoach.name);
  private readonly modelId: string;
  private readonly effort: Env["ANTHROPIC_EFFORT"];

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly messages: AnthropicMessages,
    config: ConfigService<Env, true>,
  ) {
    this.modelId = config.get("ANTHROPIC_MODEL", { infer: true });
    this.effort = config.get("ANTHROPIC_EFFORT", { infer: true });
  }

  async model(request: ModelRequest): Promise<MissionModel> {
    let response;
    try {
      response = await this.messages.parse({
        model: this.modelId,
        max_tokens: 3000,
        output_config: { effort: this.effort, format: zodOutputFormat(ModelSchema) },
        system: buildModelPrompt(request.language),
        messages: [{ role: "user", content: buildModelMessage(request) }],
      });
    } catch (error) {
      throw new TutorUnavailableError(`Claude API request failed: ${(error as Error).message}`, { cause: error });
    }
    if (response.usage) {
      this.logger.log(`tutor usage call=mission_model input=${response.usage.input_tokens} output=${response.usage.output_tokens}`);
    }
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !response.parsed_output) {
      throw new TutorUnavailableError("The mission model did not complete.");
    }
    return checked(response.parsed_output);
  }
}

/** The trimmed model, or an error when its text or its 3 expressions are not usable. */
function checked(output: z.infer<typeof ModelSchema>): MissionModel {
  const speaker = output.speaker.trim();
  const text = output.text.trim();
  const expressions = output.expressions.map((e, i) => ({ position: i + 1, phrase: e.phrase.trim(), example: e.example.trim() }));
  if (!speaker || !text) throw new TutorUnavailableError("The mission model came back empty.");
  if (text.length < MIN_MODEL_CHARS || text.length > MAX_MODEL_CHARS) {
    throw new TutorUnavailableError(`The mission model is ${text.length} characters long.`);
  }
  if (expressions.length !== MISSION_EXPRESSIONS || expressions.some((e) => !e.phrase || !e.example)) {
    throw new TutorUnavailableError(`The mission model gave ${expressions.length} expressions, not ${MISSION_EXPRESSIONS} complete ones.`);
  }
  // Each phrase leaves room for the learner's words, the 3 differ, and each example is a sentence the learner heard.
  if (expressions.some((e) => !e.phrase.includes("…"))) throw new TutorUnavailableError("A mission expression has no room for the learner's words.");
  if (new Set(expressions.map((e) => squash(e.phrase))).size !== expressions.length) {
    throw new TutorUnavailableError("The mission model gave the same expression twice.");
  }
  if (expressions.some((e) => !squash(text).includes(squash(e.example)))) {
    throw new TutorUnavailableError("A mission expression's example is not in the model.");
  }
  return { speaker: speaker.slice(0, 64), text, expressions };
}
