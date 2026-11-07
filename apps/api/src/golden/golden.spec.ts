import { describe, expect, it } from "vitest";
import type { TutorVerdict } from "../domain/conversation/correction-policy.js";
import type { TutorPort, TutorRequest } from "../domain/ports/tutor.port.js";
import { checkSpoken, checkTurn } from "./checks.js";
import { runScenario, type TurnRecord } from "./run-scenario.js";
import type { Scenario } from "./scenarios.js";

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
  hint: "Think about how you feel, not how others feel.",
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

describe("checkSpoken", () => {
  it("accepts a plain spoken line", () => {
    expect(checkSpoken("line", "Good morning! How was yesterday?")).toEqual([]);
  });

  it("flags markdown, emojis and judging words", () => {
    expect(checkSpoken("line", "**Great** job")).toHaveLength(1);
    expect(checkSpoken("line", "- first point")).toHaveLength(1);
    expect(checkSpoken("line", "Great job 🎉")).toHaveLength(1);
    expect(checkSpoken("line", "That sentence was wrong.")).toHaveLength(1);
  });

  it("allows talk about bugs and errors", () => {
    expect(checkSpoken("line", "What went wrong? Any errors in the logs?")).toEqual([]);
  });
});

describe("checkTurn", () => {
  it("passes when the turn meets its expectation", () => {
    expect(checkTurn(turn(), { kind: "reply", issues: "none" })).toEqual([]);
  });

  it("reports a different kind and issue level", () => {
    const failures = checkTurn(turn({ verdict: verdict({ issues: [{ ...bored, severity: "minor" }] }) }), {
      kind: "hint",
      issues: "serious",
    });
    expect(failures).toEqual(["kind: expected hint, got reply", "issues: expected serious, got minor-only"]);
  });

  it("reports a hint, next hint or on-screen help that gives the answer away", () => {
    const pending = { original: bored.original, correction: bored.correction, category: bored.category, hintsGiven: 1, revealed: false };
    const failures = checkTurn(
      turn({
        pendingBefore: pending,
        verdict: verdict({
          issues: [{ ...bored, hint: "Say: I am very bored." }],
          nextHint: "Try I am very bored",
          support: "Diga: I am very bored",
        }),
        decision: { kind: "hint", message: "Try again.", nextPending: { ...pending, hintsGiven: 2 }, selfCorrected: false },
      }),
      {},
    );
    // With a correction pending, only the next hint is spoken.
    expect(failures).toEqual([
      'next hint gives the answer away: "Try I am very bored"',
      'on-screen help gives the answer away: "Diga: I am very bored"',
    ]);
    const first = checkTurn(turn({ verdict: verdict({ issues: [{ ...bored, hint: "Say: I am very bored." }] }) }), {});
    expect(first).toEqual(['hint gives the answer away: "Say: I am very bored."']);
  });

  it("matches a short correction as a whole word only", () => {
    const issue = { ...bored, original: "arrived to the office", correction: "in", hint: "Think about the preposition." };
    expect(checkTurn(turn({ verdict: verdict({ issues: [issue] }) }), {})).toEqual([]);
    expect(checkTurn(turn({ verdict: verdict({ issues: [{ ...issue, hint: "Use in here." }] }) }), {})).toHaveLength(1);
  });

  it("checks new words, help, correct uses and the spoken line", () => {
    const failures = checkTurn(turn({ verdict: verdict({ issues: [{ ...bored, original: "the orçamento" }] }) }), {
      newWord: "orçamento",
      support: true,
      correctUse: "I have 32 years",
      message: /budget/,
    });
    expect(failures).toEqual([
      '"orçamento" is not listed as a new word',
      '"orçamento" was treated as a mistake',
      "no on-screen help shown",
      '"I have 32 years" is not listed as a correct use',
      'spoken line does not match /budget/: "Nice. What will you do today?"',
    ]);
  });
});

describe("runScenario", () => {
  it("keeps the history and the pending correction between turns", async () => {
    const requests: TutorRequest[] = [];
    const answers = [verdict({ issues: [bored] }), verdict({ pendingResolved: true })];
    const tutor: TutorPort = {
      open: async () => "Morning! How was yesterday?",
      evaluate: async (request) => {
        requests.push(request);
        return answers[requests.length - 1];
      },
    };
    const scenario: Scenario = {
      name: "test",
      rule: "test",
      mode: "daily",
      turns: [
        { utterance: "I am very boring.", expect: {} },
        { utterance: "I am very bored.", expect: {} },
      ],
    };

    const transcript = await runScenario(tutor, scenario, "context");

    expect(transcript.turns.map((t) => t.decision.kind)).toEqual(["hint", "reply"]);
    expect(transcript.turns[1].decision.selfCorrected).toBe(true);
    expect(requests[1].pending?.correction).toBe("I am very bored");
    expect(requests[1].history).toEqual([
      { role: "assistant", content: "Morning! How was yesterday?" },
      { role: "user", content: "I am very boring." },
      { role: "assistant", content: bored.hint },
    ]);
  });
});
