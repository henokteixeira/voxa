import { describe, expect, it } from "vitest";
import { MODES } from "../../domain/conversation/mode.js";
import { MISTAKE_TYPES } from "../../domain/mistakes/mistake-type.js";
import { SUPPORT_STEPS, type SupportStep } from "../../domain/level/speaking-level.js";
import {
  buildSystemPrompt,
  memorySection,
  buildTrackInstruction,
  buildTurnMessage,
  PLACEMENT_RULES,
  SCENES,
  SUPPORT_RULES,
} from "./tutor-prompts.js";

describe("buildSystemPrompt", () => {
  it("has a scene for every mode", () => {
    for (const mode of MODES) expect(SCENES[mode]).toBeTruthy();
  });

  it("includes the mode's scene, the language and the learner context", () => {
    const prompt = buildSystemPrompt({ mode: "daily", language: "en", learnerContext: "Works on Oral Collector.", goals: [], targets: [], step: null }, "pt-BR");
    expect(prompt).toContain(SCENES.daily);
    expect(prompt).toContain("spoken en");
    expect(prompt).toContain("Works on Oral Collector.");
  });

  it("asks for hints that never contain the corrected words", () => {
    const prompt = buildSystemPrompt({ mode: "review", language: "en", learnerContext: "", goals: [], targets: [], step: null }, "pt-BR");
    expect(prompt).toMatch(/Never include the corrected words/);
    expect(prompt).toContain("No details were given");
  });

  it("names every mistake type and asks for the rule in the learner's first language", () => {
    const prompt = buildSystemPrompt({ mode: "daily", language: "en", learnerContext: "", goals: [], targets: [], step: null }, "pt-BR");
    for (const type of MISTAKE_TYPES) expect(prompt).toContain(`\`${type}\``);
    expect(prompt).toContain("the rule in one short line, in pt-BR");
  });
});

describe("buildSystemPrompt: a daily mission's conversation", () => {
  const context = { mode: "daily" as const, language: "en", learnerContext: "", goals: [], targets: [], step: "supported" as const };

  it("invites the mission's 3 expressions and fuller answers, never as a correction", () => {
    const prompt = buildSystemPrompt({ ...context, expressions: ["I'm blocked by…", "Yesterday I…", "By the end of the day, I'll…"] }, "pt-BR");
    expect(prompt).toContain("## Today's expressions");
    expect(prompt).toContain('- "I\'m blocked by…"');
    expect(prompt).toMatch(/never treat not using one as a mistake/);
    expect(prompt).toMatch(/invite a slightly fuller one/);
    expect(prompt).toMatch(/never a hint or a correction/);
  });

  it("says nothing about expressions outside a mission", () => {
    expect(buildSystemPrompt(context, "pt-BR")).not.toContain("Today's expressions");
  });
});

describe("buildSystemPrompt: placement interview", () => {
  const context = { language: "en", learnerContext: "", goals: [], targets: [], step: null };

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
  const prompt = buildSystemPrompt({ mode: "free_talk", language: "en", learnerContext: "", goals: [], targets: [], step: null }, "pt-BR");

  it("welcomes mistakes and never grades the learner", () => {
    expect(prompt).toMatch(/Mistakes are welcome/);
    expect(prompt).toMatch(/Never grade, score or judge the learner/);
  });

  it("accepts words in the learner's first language and helps connect them", () => {
    expect(prompt).toMatch(/may say a word or a sentence in their first language/);
    expect(prompt).toMatch(/This is not a mistake: do not list it in `issues`/);
    expect(prompt).toMatch(/In `reply`, give the en words for it/);
    expect(prompt).toMatch(/When you also give a `hint` or `nextHint`, keep those words out of it and put them in `support`/);
    expect(prompt).toMatch(/List each one in `newWords`/);
    expect(prompt).toMatch(/A new word is never a mistake/);
    expect(prompt).toMatch(/`reply`, `hint` and `nextHint` are spoken: write them only in en/);
  });

  it("writes support in the learner's first language, for the screen only", () => {
    const withFirst = buildSystemPrompt({ mode: "daily", language: "en", learnerContext: "", goals: [], targets: [], step: null }, "pt-BR");
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
        step: null,
      },
      "pt-BR",
    );
    expect(prompt).toContain("- `blockers`: the learner said whether anything blocks them.");
    expect(prompt).toMatch(/List in `coveredGoals` the id of each goal this utterance covers/);
    expect(prompt).toMatch(/Never end the conversation or ask whether to stop/);
    expect(prompt).not.toContain("## Practice targets");
  });

  it("frames practice as conversation in general, not only meetings", () => {
    const prompt = buildSystemPrompt({ mode: "my_day", language: "en", learnerContext: "", goals: [], targets: [], step: null }, "pt-BR");
    expect(prompt).toContain("for real conversations, at work and in daily life");
    expect(prompt).toContain(SCENES.my_day);
    expect(prompt).not.toMatch(/meeting/i);
  });

  it("has no goals in free talk", () => {
    const prompt = buildSystemPrompt({ mode: "free_talk", language: "en", learnerContext: "", goals: [], targets: [], step: null }, "pt-BR");
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
        step: null,
      },
      "pt-BR",
    );
    expect(prompt).toContain('- "I goed" → "I went" (grammar)');
    expect(prompt).toMatch(/Never say the corrected words yourself and never mention that it is a target/);
  });
});

describe("buildSystemPrompt: help by support step", () => {
  const prompt = (step: SupportStep | null) =>
    buildSystemPrompt({ mode: "daily", language: "en", learnerContext: "", goals: [], targets: [], step }, "pt-BR");

  it("gives the start of a sentence at B1 when the learner is stuck, never the whole answer", () => {
    expect(prompt("supported")).toContain(SUPPORT_RULES.supported);
    expect(SUPPORT_RULES.supported).toMatch(/only the start of a sentence/);
    expect(SUPPORT_RULES.supported).toMatch(/Never the whole answer/);
    expect(SUPPORT_RULES.supported).toMatch(/serious mistake .* give no sentence start/);
  });

  it("follows the guided track at A1–A2", () => {
    expect(prompt("build_full")).toMatch(/guided track/);
    expect(prompt("build_light")).toMatch(/guided track/);
    expect(prompt("supported")).not.toMatch(/guided track/);
  });

  it("gives no words to say from B2 up, and none in the placement interview", () => {
    expect(prompt("conversation")).toContain(SUPPORT_RULES.conversation);
    expect(prompt("demanding")).toMatch(/harder follow-ups/);
    expect(prompt(null)).toMatch(/Give no help with what to say/);
  });

  it("always asks whether the learner is stuck", () => {
    for (const step of [...SUPPORT_STEPS, null]) expect(prompt(step)).toMatch(/Set `stuck` to true/);
  });
});

describe("buildTrackInstruction", () => {
  const goal = { id: "yesterday", description: "said what they did yesterday" };

  it("gives one instruction when it does not depend on the learner being stuck", () => {
    const step = { stage: "model" as const, retry: true, goal };
    const text = buildTrackInstruction({ otherwise: step, ifStuck: step, hintsPause: false });
    expect(text).toMatch(/^Say the same model sentence again, slowly/);
    expect(text).toContain("Goal: the learner said what they did yesterday.");
    expect(text).not.toContain("If the learner is stuck");
    expect(text).not.toContain("warm words only");
  });

  it("gives both branches when it does", () => {
    const text = buildTrackInstruction({
      otherwise: { stage: "again", retry: false, goal },
      ifStuck: { stage: "model", retry: false, goal },
      hintsPause: true,
    });
    expect(text).toMatch(/^If the learner is stuck: Say one short model sentence/);
    expect(text).toMatch(/\nOtherwise: React in a few words, then ask the learner to say their answer once more/);
    // Only the learner's own answer stops for a hint, so only then does the reply stay short.
    expect(text).toMatch(/serious mistake .* reply with a few warm words only/);
  });

  it("goes into the turn message only in the track", () => {
    const step = { stage: "answer" as const, retry: false, goal: null };
    const base = { utterance: "Hi", pending: null, knownMistakes: [], knownNewWords: [], knownPatterns: [], bringBack: [], coveredGoals: [], scaffold: null };
    expect(buildTurnMessage({ ...base, plan: { otherwise: step, ifStuck: step, hintsPause: false } })).toMatch(
      /<guided_track>\nAsk the scene's question for the goal, with no model sentence\. Goal: a short topic/,
    );
    expect(buildTurnMessage({ ...base, plan: null })).not.toContain("<guided_track>");
  });
});

describe("buildTurnMessage", () => {
  it("lists known mistakes, the pending correction and the utterance", () => {
    const message = buildTurnMessage({
      utterance: "I goed there",
      pending: { original: "I goed", correction: "I went", category: "grammar", hintsGiven: 1, revealed: false },
      knownMistakes: [{ original: "more better", correction: "better", category: "grammar" }],
      knownNewWords: [{ original: "prazo", correction: "deadline", category: "new_word" }],
      knownPatterns: [{ key: "past_simple_finished_action", name: "Past for finished actions" }],
      bringBack: [{ key: "past_simple_finished_action", name: "Past for finished actions" }],
      coveredGoals: ["yesterday"],
      scaffold: "Yesterday I...",
      plan: null,
    });
    expect(message).toContain("<words_given>\nYesterday I...\n</words_given>");
    expect(message).toContain("<known_patterns>\n- past_simple_finished_action: Past for finished actions\n</known_patterns>");
    expect(message).toContain("<bring_back>\n- past_simple_finished_action: Past for finished actions\n</bring_back>");
    expect(message).toContain("<covered_goals>\nyesterday\n</covered_goals>");
    expect(message).toContain('<new_words>\n- "prazo" → "deadline"\n</new_words>');
    expect(message).toContain('"more better" → "better" (grammar)');
    expect(message).toContain('"I goed" should be "I went" (grammar). Hints already given: 1.');
    expect(message).toContain("<utterance>\nI goed there\n</utterance>");
  });

  it("says none when there is nothing to check against", () => {
    const message = buildTurnMessage({ utterance: "Hi", pending: null, knownMistakes: [], knownNewWords: [], knownPatterns: [], bringBack: [], coveredGoals: [], scaffold: null, plan: null });
    expect(message).toContain("<words_given>\nnone\n</words_given>");
    expect(message).toContain("<new_words>\nnone\n</new_words>");
    expect(message).toContain("<known_mistakes>\nnone\n</known_mistakes>");
    expect(message).toContain("<pending_correction>\nnone\n</pending_correction>");
    expect(message).toContain("<bring_back>\nnone\n</bring_back>");
  });
});

describe("memorySection", () => {
  it("is empty when nothing is remembered", () => {
    expect(memorySection(undefined)).toBe("");
    expect(memorySection({ facts: [], recentSessions: [] })).toBe("");
  });

  it("lists the facts and the recent sessions, and asks to bring one up at most once", () => {
    const section = memorySection({
      facts: [{ topic: "work", statement: "Works as a developer." }],
      recentSessions: [
        { mode: "daily", daysAgo: 0, recap: "Fixed the upload bug." },
        { mode: "free_talk", daysAgo: 1, recap: "Talked about a trip." },
        { mode: "review", daysAgo: 5, recap: "Reviewed the sync PR." },
      ],
    });
    expect(section).toContain("at most once in this session");
    expect(section).toContain("- Works as a developer. (work)");
    expect(section).toContain("- earlier today, daily: Fixed the upload bug.");
    expect(section).toContain("- yesterday, free_talk: Talked about a trip.");
    expect(section).toContain("- 5 days ago, review: Reviewed the sync PR.");
  });

  it("goes into the system prompt", () => {
    const memory = { facts: [{ topic: "life" as const, statement: "Lives in Brazil." }], recentSessions: [] };
    const prompt = buildSystemPrompt({ mode: "daily", language: "en", learnerContext: "", memory, goals: [], targets: [], step: null }, "pt-BR");
    expect(prompt).toContain(memorySection(memory));
  });
});
