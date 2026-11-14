import { describe, expect, it } from "vitest";
import { MODES } from "../../domain/conversation/mode.js";
import { MISTAKE_TYPES } from "../../domain/mistakes/mistake-type.js";
import { SUPPORT_STEPS, type SupportStep } from "../../domain/level/speaking-level.js";
import type { TrackStep } from "../../domain/ports/tutor.port.js";
import {
  buildSystemPrompt,
  memorySection,
  buildTrackInstruction,
  buildTurnMessage,
  PLACEMENT_RULES,
  SCENES,
  strategiesSection,
  B1_TALK,
  NATURAL_STEPS,
  NATURAL_TALK,
  SURPRISES,
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

  it("lets the script build fuller answers while it runs, and invites them after", () => {
    const prompt = buildSystemPrompt({ ...context, step: "build_light", expressions: ["I'm blocked by…"] }, "pt-BR");
    expect(prompt).toMatch(/While <guided_track> is present it builds the answers step by step.* Without it: When the learner's answer/);
    expect(prompt).toMatch(/a model sentence or a sentence start they ask for may use an expression/);
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
    expect(SUPPORT_RULES.supported).toMatch(/never the whole answer/);
    expect(SUPPORT_RULES.supported).toMatch(/serious mistake .* give no sentence:/);
  });

  it("turns an idea said in the first language into one short sentence to say, at B1", () => {
    expect(SUPPORT_RULES.supported).toMatch(/mostly in their first language, give in `reply` that idea as one short, simple sentence/);
    expect(SUPPORT_RULES.supported).toMatch(/Put that sentence or start in `scaffold`/);
  });

  it("keeps the tutor's turns short at B1, with surprises only when the turn message allows them", () => {
    expect(SUPPORT_RULES.supported).toContain(B1_TALK);
    expect(B1_TALK).toMatch(/one or two short, clear spoken sentences/);
    expect(B1_TALK).toContain(SURPRISES);
    expect(NATURAL_TALK).toContain(SURPRISES);
    expect(SURPRISES).toMatch(/only when <surprise_questions> says allowed/);
    expect(prompt("supported")).toMatch(/Speak naturally, in one or two short spoken sentences\./);
  });

  it("talks at natural length from B2 up, and keeps lines short below", () => {
    expect([...NATURAL_STEPS]).toEqual(["conversation", "demanding"]);
    for (const step of SUPPORT_STEPS) {
      const natural = NATURAL_STEPS.has(step);
      expect(prompt(step).includes(NATURAL_TALK)).toBe(natural);
      expect(prompt(step).includes("short spoken sentences (one to three)")).toBe(!natural && step !== "supported");
    }
    // The placement interview (no step) keeps short lines.
    expect(prompt(null)).not.toContain(NATURAL_TALK);
    expect(prompt(null)).toMatch(/short spoken sentences \(one to three\)/);
    expect(NATURAL_TALK).toMatch(/unexpected/);
    // It never stretches a hint turn or a stuck turn, and never takes the question a rule or goal needs.
    expect(NATURAL_TALK).toMatch(/when a hint follows or the learner is stuck, keep to the few words/);
    expect(NATURAL_TALK).toMatch(/when `bring_back` lists a rule or a goal is still open, your question serves that/);
    expect(SUPPORT_RULES.demanding).not.toMatch(/sponsor/);
  });

  it("follows the step-by-step script from A1 to B1, and not from B2 up", () => {
    for (const step of ["build_full", "build_light", "supported"] as const) expect(prompt(step)).toMatch(/step-by-step script/);
    for (const step of ["conversation", "demanding"] as const) expect(prompt(step)).not.toMatch(/step-by-step script/);
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
  const step = (over: Partial<TrackStep> = {}): TrackStep => ({ stage: "answer", support: "frame", retry: false, goal, expressions: [], ...over });

  it("gives one instruction when it does not depend on the learner being stuck", () => {
    const text = buildTrackInstruction({ otherwise: step({ retry: true }), ifStuck: step({ retry: true }) });
    expect(text).toMatch(/^The learner was stuck at this step: ask again, more slowly/);
    expect(text).toContain('in `scaffold` write it with "___" at each blank');
    expect(text).toContain("Goal: the learner said what they did yesterday.");
    expect(text).not.toContain("If the learner is stuck");
  });

  it("gives both branches when it does, and keeps the reply short when a hint follows", () => {
    const text = buildTrackInstruction({ otherwise: step({ support: "start" }), ifStuck: step({ support: "example", retry: true }) });
    expect(text).toMatch(/^If the learner is stuck: The learner was stuck at this step: .*one short example answer/);
    expect(text).toMatch(/\nOtherwise: .*only the start of an answer/);
    expect(text).toMatch(/serious mistake .* reply with a few warm words only/);
    // The opening has no answer to hint about.
    expect(buildTrackInstruction({ otherwise: step(), ifStuck: step() }, true)).not.toContain("warm words only");
  });

  it("works today's expressions into the words given, asks for the parts at the last step, and says when it is over", () => {
    expect(buildTrackInstruction({ otherwise: step({ expressions: ["on top of that"] }), ifStuck: step({ expressions: ["on top of that"] }) })).toContain(
      'build the words you give around it: "on top of that"',
    );
    const last = step({ stage: "retell", goal: null });
    expect(buildTrackInstruction({ otherwise: last, ifStuck: last })).toMatch(/put it all together.* separated by " \/ "/);
    expect(buildTrackInstruction({ otherwise: null, ifStuck: last })).toMatch(/Otherwise: The script is over/);
  });

  it("goes into the turn message only in the script", () => {
    const base = { utterance: "Hi", pending: null, knownMistakes: [], knownNewWords: [], knownPatterns: [], bringBack: [], focusPatterns: [], reviewExpressions: [], coveredGoals: [], scaffold: null, surprises: false };
    expect(buildTurnMessage({ ...base, plan: { otherwise: step({ support: "alone" }), ifStuck: step({ support: "alone" }) } })).toMatch(
      /<guided_track>\nAsk the scene's question for the goal in one short sentence\. Give no words to say/,
    );
    expect(buildTurnMessage({ ...base, plan: null })).not.toContain("<guided_track>");
  });
});

describe("the reply before a hint", () => {
  it("asks for a few warm words with no question, so the learner has one thing to do", () => {
    const text = buildSystemPrompt({ mode: "daily", language: "en", learnerContext: "", goals: [], targets: [], step: "conversation" }, "pt-BR");
    expect(text).toMatch(/When a mistake needs a hint, the learner will retry .* with no question and nothing new to answer/);
  });
});

describe("strategiesSection", () => {
  it("counts asking to repeat or for time as a success, and offers such a phrase when the learner is stuck", () => {
    const text = strategiesSection("en", "pt-BR");
    expect(text).toMatch(/ask the other person to repeat/);
    expect(text).toMatch(/it is a success: never list it in `issues`, set `stuck` to false/);
    expect(text).toMatch(/When the learner is stuck, `support` may also offer one such phrase in en/);
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
      focusPatterns: [{ key: "articles_before_nouns", name: "Articles before nouns" }],
      reviewExpressions: ["I'm still working on…"],
      coveredGoals: ["yesterday"],
      scaffold: "Yesterday I...",
      plan: null,
      surprises: true,
    });
    expect(message).toContain("<surprise_questions>\nallowed\n</surprise_questions>");
    expect(message).toContain("<words_given>\nYesterday I...\n</words_given>");
    expect(message).toContain("<known_patterns>\n- past_simple_finished_action: Past for finished actions\n</known_patterns>");
    expect(message).toContain("<bring_back>\n- past_simple_finished_action: Past for finished actions\n</bring_back>");
    expect(message).toContain("<covered_goals>\nyesterday\n</covered_goals>");
    expect(message).toContain('<review_expressions>\n- "I\'m still working on…"\n</review_expressions>');
    expect(message).toContain("<focus_patterns>\n- articles_before_nouns: Articles before nouns\n</focus_patterns>");
    expect(message).toContain('<new_words>\n- "prazo" → "deadline"\n</new_words>');
    expect(message).toContain('"more better" → "better" (grammar)');
    expect(message).toContain('"I goed" should be "I went" (grammar). Hints already given: 1.');
    expect(message).toContain("<utterance>\nI goed there\n</utterance>");
  });

  it("says none when there is nothing to check against", () => {
    const message = buildTurnMessage({ utterance: "Hi", pending: null, knownMistakes: [], knownNewWords: [], knownPatterns: [], bringBack: [], focusPatterns: [], reviewExpressions: [], coveredGoals: [], scaffold: null, plan: null, surprises: false });
    expect(message).toContain("<surprise_questions>\nnot now\n</surprise_questions>");
    expect(message).toContain("<words_given>\nnone\n</words_given>");
    expect(message).toContain("<new_words>\nnone\n</new_words>");
    expect(message).toContain("<known_mistakes>\nnone\n</known_mistakes>");
    expect(message).toContain("<pending_correction>\nnone\n</pending_correction>");
    expect(message).toContain("<bring_back>\nnone\n</bring_back>");
    expect(message).toContain("<focus_patterns>\nnone\n</focus_patterns>");
    expect(message).toContain("<review_expressions>\nnone\n</review_expressions>");
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
