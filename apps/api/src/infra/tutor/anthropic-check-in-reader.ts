import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { CheckInReaderPort, CheckInReading } from "../../domain/ports/check-in-reader.port.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { ClaudeClient } from "./claude-client.js";
import { buildCheckInReadingPrompt } from "./check-in-prompts.js";

const ReadingSchema = z.object({
  mistakes: z.array(z.object({ said: z.string(), correct: z.string() })),
  otherLanguageWords: z.array(z.string()),
});

/** Speech-to-text output varies in case and spacing; compare loosely. */
const loose = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, " ").trim();

@Injectable()
export class AnthropicCheckInReader implements CheckInReaderPort {
  constructor(private readonly claude: ClaudeClient) {}

  async read({ language, transcript }: { language: string; transcript: string }): Promise<CheckInReading> {
    const reading = await this.claude.parse("check_in", {
      schema: ReadingSchema,
      maxTokens: 4000,
      system: buildCheckInReadingPrompt(language),
      messages: [{ role: "user", content: `<transcript>\n${transcript}\n</transcript>` }],
    });
    const said = loose(transcript).split(" ");
    const { mistakes, otherLanguageWords } = reading;
    // Each word Claude names counts as often as it is in the transcript; a word listed twice, or never said, adds nothing.
    const named = new Set(otherLanguageWords.flatMap((w) => loose(w).split(" ")).filter(Boolean));
    return {
      // A "mistake" whose correct form is what was said is no mistake.
      mistakes: mistakes.filter((m) => loose(m.said) !== loose(m.correct)).length,
      otherLanguageWords: said.filter((word) => named.has(word)).length,
    };
  }
}
