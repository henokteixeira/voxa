import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { ChatTurn } from "../../domain/conversation/types.js";
import { CEFR_LEVELS } from "../../domain/level/speaking-level.js";
import type { LevelAssessment, LevelAssessorPort } from "../../domain/ports/level-assessor.port.js";
import { TutorUnavailableError } from "../../domain/ports/tutor.port.js";
import { ClaudeClient } from "./claude-client.js";
import { buildAssessmentPrompt, buildTranscript } from "./level-prompts.js";

const AssessmentSchema = z.object({
  level: z.enum(CEFR_LEVELS),
  evidence: z.array(z.string()),
});

/** How many lines of evidence the Progress tab shows. */
const MAX_EVIDENCE = 3;

/** Speech-to-text output varies in case and spacing; compare loosely so a quote still counts as the learner's. */
const loose = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, " ").trim();

/** Evidence shorter than this is a fragment, not a line that shows a level. */
const MIN_EVIDENCE_WORDS = 3;

/** True when `quote` is a run of whole words from one of the learner's lines. */
function saidByLearner(quote: string, lines: string[]): boolean {
  const q = loose(quote);
  if (q.split(" ").length < MIN_EVIDENCE_WORDS) return false;
  return lines.some((line) => ` ${line} `.includes(` ${q} `));
}

@Injectable()
export class AnthropicLevelAssessor implements LevelAssessorPort {
  constructor(private readonly claude: ClaudeClient) {}

  async assess({ language, turns }: { language: string; turns: ChatTurn[] }): Promise<LevelAssessment> {
    const assessment = await this.claude.parse("assess", {
      schema: AssessmentSchema,
      maxTokens: 4000,
      system: buildAssessmentPrompt(language),
      messages: [{ role: "user", content: `<transcript>\n${buildTranscript(turns)}\n</transcript>` }],
    });
    // Only the learner's own lines count as evidence.
    const said = turns.filter((t) => t.role === "user").map((t) => loose(t.content));
    const evidence = assessment.evidence
      .map((e) => e.trim())
      .filter((e) => saidByLearner(e, said))
      .slice(0, MAX_EVIDENCE);
    return { level: assessment.level, evidence };
  }
}
