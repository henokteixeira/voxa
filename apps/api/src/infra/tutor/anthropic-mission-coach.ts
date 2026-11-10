import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { MISSION_EXPRESSIONS, type NewMissionExpression, type NewMissionModel } from "../../domain/mission/mission.js";
import type { MissionCoachPort, ModelRequest } from "../../domain/ports/mission-coach.port.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { ClaudeClient } from "./claude-client.js";
import { buildModelMessage, buildModelPrompt, buildUsedMessage, buildUsedPrompt } from "./mission-prompts.js";

/** About a minute and a half of speech at most; the voice engine takes up to 2000 characters. */
export const MAX_MODEL_CHARS = 1500;
/** Even the shortest model (about 70 words at A1) is longer than this: a shorter one shows nothing to learn from. */
export const MIN_MODEL_CHARS = 200;

const squash = (text: string) => text.replace(/\s+/g, " ").toLowerCase();

const UsedSchema = z.object({ used: z.boolean() });

const ModelSchema = z.object({
  speaker: z.string(),
  text: z.string(),
  expressions: z.array(z.object({ phrase: z.string(), example: z.string() })),
});

@Injectable()
export class AnthropicMissionCoach implements MissionCoachPort {
  constructor(private readonly claude: ClaudeClient) {}

  async model(request: ModelRequest): Promise<NewMissionModel> {
    const output = await this.ask("mission_model", ModelSchema, 3000, buildModelPrompt(request.language), buildModelMessage(request));
    return checked(output);
  }

  async usedExpression(language: string, expression: Pick<NewMissionExpression, "phrase" | "example">, utterance: string): Promise<boolean> {
    const result = await this.ask("mission_expression", UsedSchema, 1000, buildUsedPrompt(language), buildUsedMessage(expression, utterance));
    return result.used;
  }

  private ask<T>(task: "mission_model" | "mission_expression", schema: z.ZodType<T>, maxTokens: number, system: string, content: string): Promise<T> {
    return this.claude.parse(task, { schema, system, maxTokens, messages: [{ role: "user", content }] });
  }

}

/** The trimmed model, or an error when its text or its 3 expressions are not usable. */
function checked(output: z.infer<typeof ModelSchema>): NewMissionModel {
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
