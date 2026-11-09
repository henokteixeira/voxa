import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { CheckInReaderPort, CheckInReading } from "../../domain/ports/check-in-reader.port.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { ANTHROPIC_CLIENT, type AnthropicMessages } from "./anthropic-tutor.adapter.js";
import { buildCheckInReadingPrompt } from "./check-in-prompts.js";

const ReadingSchema = z.object({
  mistakes: z.array(z.object({ said: z.string(), correct: z.string() })),
  otherLanguageWords: z.array(z.string()),
});

/** Speech-to-text output varies in case and spacing; compare loosely. */
const loose = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, " ").trim();

@Injectable()
export class AnthropicCheckInReader implements CheckInReaderPort {
  private readonly logger = new Logger(AnthropicCheckInReader.name);
  private readonly model: string;

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly messages: AnthropicMessages,
    config: ConfigService<Env, true>,
  ) {
    this.model = config.get("ANTHROPIC_MODEL", { infer: true });
  }

  async read({ language, transcript }: { language: string; transcript: string }): Promise<CheckInReading> {
    let response;
    try {
      response = await this.messages.parse({
        model: this.model,
        max_tokens: 4000,
        // Runs once every 2 weeks, after the recording: no one waits on a spoken reply.
        output_config: { effort: "medium", format: zodOutputFormat(ReadingSchema) },
        system: buildCheckInReadingPrompt(language),
        messages: [{ role: "user", content: `<transcript>\n${transcript}\n</transcript>` }],
      });
    } catch (error) {
      throw new TutorUnavailableError(`Claude API request failed: ${(error as Error).message}`, { cause: error });
    }
    if (response.usage) {
      this.logger.log(`tutor usage call=check_in input=${response.usage.input_tokens} output=${response.usage.output_tokens}`);
    }
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !response.parsed_output) {
      throw new TutorUnavailableError("The check-in reading did not complete.");
    }
    const said = loose(transcript).split(" ");
    const { mistakes, otherLanguageWords } = response.parsed_output;
    // Each word Claude names counts as often as it is in the transcript; a word listed twice, or never said, adds nothing.
    const named = new Set(otherLanguageWords.flatMap((w) => loose(w).split(" ")).filter(Boolean));
    return {
      // A "mistake" whose correct form is what was said is no mistake.
      mistakes: mistakes.filter((m) => loose(m.said) !== loose(m.correct)).length,
      otherLanguageWords: said.filter((word) => named.has(word)).length,
    };
  }
}
