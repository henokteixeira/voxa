import { isSerious } from "../domain/conversation/correction-policy.js";
import { checkTurn } from "../golden/checks.js";
import type { TurnRecord } from "../golden/run-scenario.js";
import type { TurnExpectation } from "../golden/scenarios.js";
import type { TurnTiming } from "./metering.js";

export const CATEGORIES = ["detection", "hints", "selfCorrection", "flow", "speech"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  detection: "Mistake detection",
  hints: "Hints keep the answer",
  selfCorrection: "Self-correction",
  flow: "Hint / reply / reveal",
  speech: "Spoken line",
};

/** Which category a failure from `checkTurn` belongs to. */
export function categoryOf(failure: string): Category {
  if (/^(issues:|no issue matched)|is not listed as a (new word|correct use)|was treated as a mistake/.test(failure)) {
    return "detection";
  }
  if (failure.includes("gives the answer away")) return "hints";
  if (failure.startsWith("selfCorrected:")) return "selfCorrection";
  if (failure.startsWith("kind:")) return "flow";
  return "speech";
}

/** The categories a turn is checked on. Speech rules apply to every turn. */
function checkedCategories(turn: TurnRecord, expect: TurnExpectation): Category[] {
  const out: Category[] = ["speech"];
  if (expect.issues || expect.matchesKnownMistake || expect.newWord || expect.correctUse) out.push("detection");
  const firstHint = !turn.pendingBefore && turn.verdict.issues.some(isSerious);
  const nextHint = Boolean(turn.pendingBefore && turn.verdict.nextHint);
  const help = Boolean(turn.decision.nextPending && turn.verdict.support);
  if (firstHint || nextHint || help) out.push("hints");
  if (expect.selfCorrected !== undefined) out.push("selfCorrection");
  if (expect.kind) out.push("flow");
  return out;
}

export interface TurnScore {
  checked: Category[];
  failures: { category: Category; failure: string }[];
}

export function scoreTurn(turn: TurnRecord, expect: TurnExpectation): TurnScore {
  const failures = checkTurn(turn, expect).map((failure) => ({ category: categoryOf(failure), failure }));
  // A failure always counts, also in a category the turn was not expected to be checked on.
  const checked = [...new Set([...checkedCategories(turn, expect), ...failures.map((f) => f.category)])];
  return { checked, failures };
}

export interface ScenarioResult {
  scenario: string;
  /** Null when a tutor call failed. */
  turns: TurnScore[] | null;
  error?: string;
}

export interface ModelResult {
  /** Model id plus effort, e.g. "claude-haiku-5-5 (low)". */
  label: string;
  scenarios: ScenarioResult[];
  timings: TurnTiming[];
  /** Dollars; null when the model has no price. */
  openCost: number | null;
  turnCost: number | null;
  /** Learner turns the tutor answered. */
  turns: number;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export interface Summary {
  label: string;
  scenariosPassed: number;
  scenarios: number;
  errors: number;
  /** Passed and checked turns per category. */
  categories: Record<Category, { passed: number; checked: number }>;
  replyP50: number | null;
  replyP90: number | null;
  totalP50: number | null;
  costPerTurn: number | null;
  totalCost: number | null;
}

export function summarize(result: ModelResult): Summary {
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, { passed: 0, checked: 0 }])) as Summary["categories"];
  let scenariosPassed = 0;
  for (const { turns } of result.scenarios) {
    if (!turns) continue;
    if (turns.every((t) => t.failures.length === 0)) scenariosPassed++;
    for (const turn of turns) {
      for (const c of turn.checked) {
        categories[c].checked++;
        if (!turn.failures.some((f) => f.category === c)) categories[c].passed++;
      }
    }
  }
  const replies = result.timings.flatMap((t) => (t.replyMs === null ? [] : [t.replyMs]));
  return {
    label: result.label,
    scenariosPassed,
    scenarios: result.scenarios.length,
    errors: result.scenarios.filter((s) => !s.turns).length,
    categories,
    replyP50: percentile(replies, 50),
    replyP90: percentile(replies, 90),
    totalP50: percentile(
      result.timings.map((t) => t.totalMs),
      50,
    ),
    costPerTurn: result.turnCost === null || result.turns === 0 ? null : result.turnCost / result.turns,
    totalCost: result.openCost === null || result.turnCost === null ? null : result.openCost + result.turnCost,
  };
}

const pct = ({ passed, checked }: { passed: number; checked: number }) =>
  checked === 0 ? "–" : `${Math.round((passed / checked) * 100)}% (${passed}/${checked})`;
const secs = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)} s`);
const dollars = (n: number | null, digits: number) => (n === null ? "?" : `$${n.toFixed(digits)}`);

/** The comparison as Markdown: one row per model, then every failure. */
export function formatReport(results: ModelResult[], runs: number): string {
  const summaries = results.map(summarize);
  const header = [
    "Model",
    "Scenarios passed",
    ...CATEGORIES.map((c) => CATEGORY_LABELS[c]),
    "Reply wait p50 / p90",
    "Full turn p50",
    "Cost per turn",
    "Cost per 100 turns",
    "Errors",
  ];
  const rows = summaries.map((s) => [
    s.label,
    `${s.scenariosPassed}/${s.scenarios}`,
    ...CATEGORIES.map((c) => pct(s.categories[c])),
    `${secs(s.replyP50)} / ${secs(s.replyP90)}`,
    secs(s.totalP50),
    dollars(s.costPerTurn, 4),
    dollars(s.costPerTurn === null ? null : s.costPerTurn * 100, 2),
    String(s.errors),
  ]);
  const table = [header, header.map(() => "---"), ...rows].map((r) => `| ${r.join(" | ")} |`).join("\n");
  const spent = summaries.reduce<number | null>(
    (sum, s) => (sum === null || s.totalCost === null ? null : sum + s.totalCost),
    0,
  );

  const failures = results.flatMap((r) => {
    const lines = r.scenarios.flatMap((s) =>
      s.turns
        ? s.turns.flatMap((t, i) => t.failures.map((f) => `- ${s.scenario}, turn ${i + 1} (${f.category}): ${f.failure}`))
        : [`- ${s.scenario}: error: ${s.error}`],
    );
    return lines.length ? [`### ${r.label}`, "", ...lines, ""] : [];
  });

  return [
    "# Tutor model comparison",
    "",
    `Each scenario ran ${runs} time(s) per model. Percentages count checked turns that passed.`,
    "Reply wait: from the request to the spoken reply. Cost per turn: one learner turn, tokens at list price.",
    `Spent on this run: ${dollars(spent, 2)}.`,
    "",
    table,
    "",
    "## Failures",
    "",
    ...(failures.length ? failures : ["None."]),
  ].join("\n");
}
