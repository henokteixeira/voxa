import { describe, expect, it } from "vitest";
import type { TutorVerdict } from "../domain/conversation/correction-policy.js";
import type { TutorPort } from "../domain/ports/tutor.port.js";
import type { TurnRecord } from "../golden/run-scenario.js";
import { ALL_SCENARIOS, SCENARIOS } from "../golden/scenarios.js";
import type { AnthropicMessages } from "../infra/tutor/anthropic-tutor.adapter.js";
import { meteredMessages, timedTutor } from "./metering.js";
import { costOf } from "./pricing.js";
import { categoryOf, formatReport, type ModelResult, percentile, scoreTurn, summarize } from "./score.js";

const verdict = (over: Partial<TutorVerdict> = {}): TutorVerdict => ({
  reply: "Nice. What will you do today?",
  issues: [],
  pendingResolved: false,
  nextHint: null,
  correctUses: [],
  newWords: [],
  support: null,
  coveredGoals: [],
  stuck: false,
  scaffold: null,
  ...over,
});

const bored = {
  original: "I am very boring",
  correction: "I am very bored",
  category: "word_choice",
  severity: "serious" as const,
  hint: "Say: I am very bored.",
  matchesKnownMistake: false,
};

const turn = (over: Partial<TurnRecord> = {}): TurnRecord => ({
  utterance: "…",
  scaffold: null,
  pendingBefore: null,
  verdict: verdict(),
  decision: { kind: "reply", message: "Nice. What will you do today?", nextPending: null, selfCorrected: false },
  support: null,
  ...over,
});

describe("scenarios", () => {
  it("keeps the golden sessions a small subset of the eval scenarios", () => {
    expect(SCENARIOS).toHaveLength(5);
    for (const s of SCENARIOS) expect(ALL_SCENARIOS).toContain(s);
    expect(new Set(ALL_SCENARIOS.map((s) => s.name)).size).toBe(ALL_SCENARIOS.length);
  });
});

describe("costOf", () => {
  it("prices each kind of token", () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 0 };
    expect(costOf("claude-opus-5-5", usage)).toBeCloseTo(24.2);
    expect(costOf("claude-haiku-5-5", { ...usage, cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(0.735);
  });

  it("returns null for a model without a price", () => {
    expect(costOf("unknown", { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBeNull();
  });
});

describe("meteredMessages", () => {
  it("reports the usage of the opening and of each streamed turn", async () => {
    const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const handlers: ((message: { usage: typeof usage }) => void)[] = [];
    const inner = {
      create: () => undefined,
      parse: () => Promise.resolve({ usage }),
      stream: () => ({ on: (_event: string, fn: (m: { usage: typeof usage }) => void) => handlers.push(fn) }),
    } as unknown as AnthropicMessages;
    const seen: string[] = [];
    const messages = meteredMessages(inner, (kind, u) => seen.push(`${kind}:${u.input_tokens}`));

    await messages.parse({} as never);
    messages.stream({} as never);
    handlers[0]({ usage });

    expect(seen).toEqual(["open:10", "evaluate:10"]);
  });
});

describe("timedTutor", () => {
  it("times the spoken reply and the whole turn, and still hands the reply on", async () => {
    let clock = 0;
    const inner: TutorPort = {
      open: async () => "Hi",
      evaluate: async (_request, onReply) => {
        clock = 1200;
        onReply?.("Nice.");
        clock = 3000;
        return verdict();
      },
    };
    const timings: { replyMs: number | null; totalMs: number }[] = [];
    const heard: string[] = [];
    const tutor = timedTutor(inner, (t) => timings.push(t), () => clock);

    await tutor.evaluate({} as never, (r) => heard.push(r));

    expect(timings).toEqual([{ replyMs: 1200, totalMs: 3000 }]);
    expect(heard).toEqual(["Nice."]);
  });
});

describe("scoreTurn", () => {
  it("files each failure under its category", () => {
    expect(categoryOf("issues: expected serious, got none")).toBe("detection");
    expect(categoryOf('"orçamento" was treated as a mistake')).toBe("detection");
    expect(categoryOf('hint gives the answer away: "x"')).toBe("hints");
    expect(categoryOf("selfCorrected: expected true, got false")).toBe("selfCorrection");
    expect(categoryOf("kind: expected hint, got reply")).toBe("flow");
    expect(categoryOf("no on-screen help shown")).toBe("content");
    expect(categoryOf('spoken line does not match /budget/: "x"')).toBe("content");
    expect(categoryOf('spoken line has markdown: "x"')).toBe("speech");
  });

  it("checks hints only when the tutor gave one, and counts a leak", () => {
    expect(scoreTurn(turn(), { kind: "reply", issues: "none" }).checked).toEqual(["speech", "detection", "flow"]);
    const leaked = scoreTurn(
      turn({
        verdict: verdict({ issues: [bored] }),
        decision: { kind: "hint", message: bored.hint, nextPending: null, selfCorrected: false },
      }),
      { kind: "hint", issues: "serious" },
    );
    expect(leaked.checked).toContain("hints");
    expect(leaked.failures).toEqual([{ category: "hints", failure: 'hint gives the answer away: "Say: I am very bored."' }]);
  });
});

describe("report", () => {
  const result: ModelResult = {
    label: "claude-haiku-5-5 (low)",
    scenarios: [
      { scenario: "a", turns: [{ checked: ["speech", "detection"], failures: [] }] },
      { scenario: "b", turns: [{ checked: ["speech", "detection"], failures: [{ category: "detection", failure: "issues: x" }] }] },
      { scenario: "c", turns: null, error: "timeout" },
    ],
    timings: [
      { replyMs: 1000, totalMs: 2000 },
      { replyMs: 3000, totalMs: 4000 },
    ],
    openCost: 0.01,
    turnCost: 0.02,
    turns: 2,
  };

  it("adds up scores, latency and cost", () => {
    const s = summarize(result);
    expect(s).toMatchObject({ scenariosPassed: 1, scenarios: 3, errors: 1, replyP50: 1000, replyP90: 3000, costPerTurn: 0.01 });
    expect(s.categories.detection).toEqual({ passed: 1, checked: 2 });
    expect(s.totalCost).toBeCloseTo(0.03);
  });

  it("prints one row per model and lists every failure", () => {
    const report = formatReport([result], 1);
    expect(report).toContain("| claude-haiku-5-5 (low) | 1/3 | 50% (1/2) |");
    expect(report).toContain("- b, turn 1 (detection): issues: x");
    expect(report).toContain("- c: error: timeout");
  });

  it("takes percentiles from sorted values", () => {
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([], 50)).toBeNull();
  });
});
