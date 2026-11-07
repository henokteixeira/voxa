import { join } from "node:path";
import { scriptConfig } from "../config/env.js";
import { describe, test } from "vitest";
import { AnthropicTutorAdapter, anthropicClientProvider } from "../infra/tutor/anthropic-tutor.adapter.js";
import { checkSpoken, checkTurn } from "./checks.js";
import { formatTranscript, runScenario } from "./run-scenario.js";
import { GOLDEN_LEARNER_CONTEXT, SCENARIOS } from "./scenarios.js";

// Golden sessions: scripted conversations against the real tutor (Claude), with the model and effort from .env.
// They cost API credits, so they run only on demand: `pnpm --filter @voxa/api golden` (reads the repository .env).
// The repository .env, like the app. In Docker there is none: compose passes it as env_file. Set variables win.
try {
  process.loadEnvFile(join(__dirname, "../../../../.env"));
} catch {
  // No .env file.
}
if (!process.env.ANTHROPIC_API_KEY) throw new Error("Golden sessions call Claude: set ANTHROPIC_API_KEY (see .env.example).");

const tutor = new AnthropicTutorAdapter(anthropicClientProvider.useFactory(), scriptConfig(process.env));

describe("golden sessions", () => {
  test.concurrent.for(SCENARIOS.map((s) => [s.name, s] as const))("%s", async ([, scenario], { expect }) => {
    const transcript = await runScenario(tutor, scenario, GOLDEN_LEARNER_CONTEXT);
    const failures = [
      ...checkSpoken("opening line", transcript.opening),
      ...(scenario.openingGivesWords && !transcript.openingScaffold ? ["the opening gives no model sentence"] : []),
      ...transcript.turns.flatMap((turn, i) =>
        checkTurn(turn, scenario.turns[i].expect).map((f) => `turn ${i + 1}: ${f}`),
      ),
    ];
    expect(failures, `${scenario.rule}\n\n${formatTranscript(transcript)}\n`).toEqual([]);
  });
});
