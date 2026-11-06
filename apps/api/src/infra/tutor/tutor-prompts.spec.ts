import { describe, expect, it } from "vitest";
import { MODES } from "../../domain/conversation/mode.js";
import { buildSystemPrompt, buildTurnMessage, SCENES } from "./tutor-prompts.js";

describe("buildSystemPrompt", () => {
  it("has a scene for every mode", () => {
    for (const mode of MODES) expect(SCENES[mode]).toBeTruthy();
  });

  it("includes the mode's scene, the language and the learner context", () => {
    const prompt = buildSystemPrompt({ mode: "daily", language: "en", learnerContext: "Works on Oral Collector." });
    expect(prompt).toContain(SCENES.daily);
    expect(prompt).toContain("spoken en");
    expect(prompt).toContain("Works on Oral Collector.");
  });

  it("asks for hints that never contain the corrected words", () => {
    const prompt = buildSystemPrompt({ mode: "review", language: "en", learnerContext: "" });
    expect(prompt).toMatch(/Never include the corrected words/);
    expect(prompt).toContain("No details were given");
  });
});

describe("buildTurnMessage", () => {
  it("lists known mistakes, the pending correction and the utterance", () => {
    const message = buildTurnMessage({
      utterance: "I goed there",
      pending: { original: "I goed", correction: "I went", category: "grammar", hintsGiven: 1, revealed: false },
      knownMistakes: [{ original: "more better", correction: "better", category: "grammar" }],
    });
    expect(message).toContain('"more better" → "better" (grammar)');
    expect(message).toContain('"I goed" should be "I went" (grammar). Hints already given: 1.');
    expect(message).toContain("<utterance>\nI goed there\n</utterance>");
  });

  it("says none when there is nothing to check against", () => {
    const message = buildTurnMessage({ utterance: "Hi", pending: null, knownMistakes: [] });
    expect(message).toContain("<known_mistakes>\nnone\n</known_mistakes>");
    expect(message).toContain("<pending_correction>\nnone\n</pending_correction>");
  });
});
