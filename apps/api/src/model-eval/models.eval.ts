import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { afterAll, describe, test } from "vitest";
import { AnthropicTutorAdapter, anthropicClientProvider } from "../infra/tutor/anthropic-tutor.adapter.js";
import { runScenario } from "../golden/run-scenario.js";
import { ALL_SCENARIOS, GOLDEN_LEARNER_CONTEXT, type Scenario } from "../golden/scenarios.js";
import { meteredMessages, timedTutor, type TurnTiming } from "./metering.js";
import { costOf } from "./pricing.js";
import { formatReport, type ModelResult, type ScenarioResult, scoreTurn } from "./score.js";

// Model eval: every scripted conversation against each model, scored and priced side by side.
// It costs API credits, so it runs only on demand: `pnpm --filter @voxa/api eval:models`.
// EVAL_MODELS: comma-separated model ids, each with an optional effort ("claude-haiku-5-5@medium").
// EVAL_RUNS: how many times each scenario runs per model (default 2), since answers vary between runs.
try {
  process.loadEnvFile(join(__dirname, "../../../../.env"));
} catch {
  // No .env file.
}
if (!process.env.ANTHROPIC_API_KEY) throw new Error("The model eval calls Claude: set ANTHROPIC_API_KEY (see .env.example).");

const DEFAULT_MODELS = "claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5";
const defaultEffort = process.env.ANTHROPIC_EFFORT || "low";
const models = (process.env.EVAL_MODELS || DEFAULT_MODELS)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((spec) => {
    const [model, effort = defaultEffort] = spec.split("@");
    return { model, effort };
  });
const runs = Math.max(1, Number(process.env.EVAL_RUNS) || 2);
/** Scenarios in flight at once for one model. */
const CONCURRENCY = 4;

// The adapter logs token usage on every call; the report adds it up instead.
Logger.overrideLogger(["error", "warn"]);

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) await work(item);
    }),
  );
}

async function evaluateModel(model: string, effort: string): Promise<ModelResult> {
  let openCost: number | null = 0;
  let turnCost: number | null = 0;
  const messages = meteredMessages(anthropicClientProvider.useFactory(), (kind, usage) => {
    const cost = costOf(model, usage);
    if (kind === "open") openCost = openCost === null || cost === null ? null : openCost + cost;
    else turnCost = turnCost === null || cost === null ? null : turnCost + cost;
  });
  const config = new ConfigService({ ...process.env, ANTHROPIC_MODEL: model, ANTHROPIC_EFFORT: effort });
  const timings: TurnTiming[] = [];
  const tutor = timedTutor(new AnthropicTutorAdapter(messages, config), (t) => timings.push(t));

  const jobs: Scenario[] = Array.from({ length: runs }, () => ALL_SCENARIOS).flat();
  const scenarios: ScenarioResult[] = [];
  await pool(jobs, CONCURRENCY, async (scenario) => {
    try {
      const transcript = await runScenario(tutor, scenario, GOLDEN_LEARNER_CONTEXT);
      scenarios.push({
        scenario: scenario.name,
        turns: transcript.turns.map((turn, i) => scoreTurn(turn, scenario.turns[i].expect)),
      });
    } catch (error) {
      scenarios.push({ scenario: scenario.name, turns: null, error: (error as Error).message });
    }
  });
  return { label: `${model} (${effort})`, scenarios, timings, openCost, turnCost, turns: timings.length };
}

const results: ModelResult[] = [];

describe("tutor model eval", () => {
  // One model at a time, so models do not slow each other down and latencies compare fairly.
  for (const { model, effort } of models) {
    test(`${model} (${effort})`, async () => {
      results.push(await evaluateModel(model, effort));
    });
  }

  afterAll(() => {
    if (!results.length) return;
    const report = formatReport(results, runs);
    const dir = join(__dirname, "../../eval-results");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `models-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
    writeFileSync(file, `${report}\n`);
    console.log(`\n${report}\n\nSaved to apps/api/eval-results/${file.split("/").pop()}\n`);
  });
});
