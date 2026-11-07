import { describe, expect, it } from "vitest";
import { MODES } from "../../domain/conversation/mode.js";
import { buildSystemPrompt, buildTurnMessage, PLACEMENT_RULES, SCENES } from "./tutor-prompts.js";

describe("buildSystemPrompt", () => {
  it("has a scene for every mode", () => {
    for (const mode of MODES) expect(SCENES[mode]).toBeTruthy();
  });

  it("includes the mode's scene, the language and the learner context", () => {
    const prompt = buildSystemPrompt({ mode: "daily", language: "en", learnerContext: "Works on Oral Collector.", goals: [], targets: [] }, "pt-BR");
    expect(prompt).toContain(SCENES.daily);
    expect(prompt).toContain("spoken en");
    expect(prompt).toContain("Works on Oral Collector.");
  });

  it("asks for hints that never contain the corrected words", () => {
    const prompt = buildSystemPrompt({ mode: "review", language: "en", learnerContext: "", goals: [], targets: [] }, "pt-BR");
    expect(prompt).toMatch(/Never include the corrected words/);
    expect(prompt).toContain("No details were given");
  });
});

describe("buildSystemPrompt: placement interview", () => {
  const context = { language: "en", learnerContext: "", goals: [], targets: [] };

  it("adds the observe-only rules after the general ones, so they win", () => {
    const prompt = buildSystemPrompt({ ...context, mode: "placement" }, "pt-BR");
    expect(prompt).toContain(PLACEMENT_RULES);
    expect(prompt.indexOf(PLACEMENT_RULES)).toBeGreaterThan(prompt.indexOf("## A safe place to make mistakes"));
    expect(PLACEMENT_RULES).toMatch(/Never teach/);
  });

  it("keeps them out of the meeting modes", () => {
    expect(buildSystemPrompt({ ...context, mode: "daily" }, "pt-BR")).not.toContain(PLACEMENT_RULES);
  });
});

describe("buildSystemPrompt: a safe place to make mistakes", () => {
  const prompt = buildSystemPrompt({ mode: "free_talk", language: "en", learnerContext: "", goals: [], targets: [] }, "pt-BR");

  it("welcomes mistakes and never grades the learner", () => {
    expect(prompt).toMatch(/Mistakes are welcome/);
    expect(prompt).toMatch(/Never grade, score or judge the learner/);
  });

  it("accepts words in the learner's first language and helps connect them", () => {
    expect(prompt).toMatch(/may say a word or a sentence in their first language/);
    expect(prompt).toMatch(/This is not a mistake: do not list it in `issues`/);
    expect(prompt).toMatch(/In `reply`, give the en words for it/);
    expect(prompt).toMatch(/When you also give a `hint` or `nextHint`, start it with those words too/);
    expect(prompt).toMatch(/List each one in `newWords`/);
    expect(prompt).toMatch(/A new word is never a mistake/);
    expect(prompt).toMatch(/`reply`, `hint` and `nextHint` are spoken: write them only in en/);
  });

  it("writes support in the learner's first language, for the screen only", () => {
    const withFirst = buildSystemPrompt({ mode: "daily", language: "en", learnerContext: "", goals: [], targets: [] }, "pt-BR");
    expect(withFirst).toContain("The learner's first language is pt-BR");
    expect(withFirst).toMatch(/`support`: .*written in pt-BR.*shown on screen and never read aloud/s);
  });

  it("tells the tutor to admit what it does not know", () => {
    expect(prompt).toMatch(/When you do not know something, say so plainly/);
    expect(prompt).toMatch(/When you are not sure something is a mistake, leave it out of `issues`/);
  });

  it("asks which known mistakes the learner got right, by their exact text", () => {
    expect(prompt).toMatch(/List in `correctUses` each known mistake the learner avoided/);
    expect(prompt).toMatch(/Copy its `original` text from the known mistakes or new words list exactly/);
  });

  it("keeps the correction checks strict", () => {
    expect(prompt).toMatch(/Being kind does not change how you judge `severity` and `pendingResolved`/);
  });
});

describe("buildSystemPrompt: goals and practice targets", () => {
  it("lists the meeting's goals by id and asks which ones the utterance covers", () => {
    const prompt = buildSystemPrompt(
      {
        mode: "daily",
        language: "en",
        learnerContext: "",
        goals: [{ id: "blockers", description: "said whether anything blocks them" }],
        targets: [],
      },
      "pt-BR",
    );
    expect(prompt).toContain("- `blockers`: the learner said whether anything blocks them.");
    expect(prompt).toMatch(/List in `coveredGoals` the id of each goal this utterance covers/);
    expect(prompt).toMatch(/Never end the meeting or ask whether to stop/);
    expect(prompt).not.toContain("## Practice targets");
  });

  it("has no goals in free talk", () => {
    const prompt = buildSystemPrompt({ mode: "free_talk", language: "en", learnerContext: "", goals: [], targets: [] }, "pt-BR");
    expect(prompt).toContain("No fixed goals");
  });

  it("asks for chances to practice the targets, without giving the answer", () => {
    const prompt = buildSystemPrompt(
      {
        mode: "daily",
        language: "en",
        learnerContext: "",
        goals: [],
        targets: [{ original: "I goed", correction: "I went", category: "grammar" }],
      },
      "pt-BR",
    );
    expect(prompt).toContain('- "I goed" → "I went" (grammar)');
    expect(prompt).toMatch(/Never say the corrected words yourself and never mention that it is a target/);
  });
});

describe("buildTurnMessage", () => {
  it("lists known mistakes, the pending correction and the utterance", () => {
    const message = buildTurnMessage({
      utterance: "I goed there",
      pending: { original: "I goed", correction: "I went", category: "grammar", hintsGiven: 1, revealed: false },
      knownMistakes: [{ original: "more better", correction: "better", category: "grammar" }],
      knownNewWords: [{ original: "prazo", correction: "deadline", category: "new_word" }],
      coveredGoals: ["yesterday"],
    });
    expect(message).toContain("<covered_goals>\nyesterday\n</covered_goals>");
    expect(message).toContain('<new_words>\n- "prazo" → "deadline"\n</new_words>');
    expect(message).toContain('"more better" → "better" (grammar)');
    expect(message).toContain('"I goed" should be "I went" (grammar). Hints already given: 1.');
    expect(message).toContain("<utterance>\nI goed there\n</utterance>");
  });

  it("says none when there is nothing to check against", () => {
    const message = buildTurnMessage({ utterance: "Hi", pending: null, knownMistakes: [], knownNewWords: [], coveredGoals: [] });
    expect(message).toContain("<new_words>\nnone\n</new_words>");
    expect(message).toContain("<known_mistakes>\nnone\n</known_mistakes>");
    expect(message).toContain("<pending_correction>\nnone\n</pending_correction>");
  });
});
