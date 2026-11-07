import type { TurnKind } from "../domain/conversation/correction-policy.js";
import type { Mode } from "../domain/conversation/mode.js";
import type { TrackStage } from "../domain/conversation/guided-track.js";
import type { SupportStep } from "../domain/level/speaking-level.js";
import type { KnownMistake } from "../domain/ports/tutor.port.js";

/** What one learner turn must produce. Unset fields are not checked. */
export interface TurnExpectation {
  kind?: TurnKind;
  selfCorrected?: boolean;
  /** "none": no mistakes found. "serious": at least one serious (or known) mistake. "minor-only": mistakes, none serious. */
  issues?: "none" | "serious" | "minor-only";
  /** At least one issue matched a known mistake. */
  matchesKnownMistake?: boolean;
  /** A first-language word the tutor must list in `newWords`, and never as a mistake. */
  newWord?: string;
  /** The on-screen help (`support`) must be present. */
  support?: boolean;
  /** A known mistake (its `original`) the tutor must list in `correctUses`. */
  correctUse?: string;
  /** The tutor's spoken line must match. */
  message?: RegExp;
  /** Whether the tutor must see the learner as stuck. */
  stuck?: boolean;
  /** true: the tutor gives words to say next, and says them. false: it gives none. */
  scaffold?: boolean;
  /** In the guided track: the stage the learner must be at after this turn. */
  stage?: TrackStage;
}

export interface ScriptedTurn {
  utterance: string;
  expect: TurnExpectation;
}

export interface Scenario {
  name: string;
  /** The rule from the product this scenario guards, in plain words. */
  rule: string;
  mode: Mode;
  /** The session's support step; defaults to the step of a learner without a level. */
  step?: SupportStep;
  knownMistakes?: KnownMistake[];
  knownNewWords?: KnownMistake[];
  /** The opening must give words to say (the guided track's first model sentence). */
  openingGivesWords?: boolean;
  turns: ScriptedTurn[];
}

/** Fixed and generic, so results do not depend on anyone's personal tutor-context.md. */
export const GOLDEN_LEARNER_CONTEXT =
  "The learner is a software developer who works remotely with an international team.";

const AGE: KnownMistake = { original: "I have 32 years", correction: "I am 32 years old", category: "grammar" };

/** Every scripted conversation. The model eval runs them all; the golden sessions run a few. */
export const ALL_SCENARIOS: Scenario[] = [
  {
    name: "serious mistake: hint, then the learner fixes it",
    rule: "A mistake that changes the meaning pauses the talk with a hint; fixing it alone counts as a self-correction.",
    mode: "daily",
    turns: [
      { utterance: "I am very boring in the long meetings.", expect: { kind: "hint", issues: "serious" } },
      { utterance: "I am very bored in the long meetings.", expect: { kind: "reply", selfCorrected: true } },
    ],
  },
  {
    name: "serious mistake: two hints, then the correct form",
    rule: "Up to two hints; then the tutor shows the correct form and asks the learner to repeat it.",
    mode: "daily",
    turns: [
      { utterance: "I am very boring in the long meetings.", expect: { kind: "hint", issues: "serious" } },
      { utterance: "Yes, I am boring in the long meetings.", expect: { kind: "hint" } },
      { utterance: "I am boring, I think.", expect: { kind: "reveal" } },
      // After the correct form is shown the policy always goes on; this turn checks the spoken line only.
      { utterance: "I am very bored in the long meetings.", expect: { kind: "reply" } },
    ],
  },
  {
    name: "minor mistake: noted, the talk goes on",
    rule: "A small mistake is only saved for the summary; the conversation is not paused.",
    mode: "free_talk",
    turns: [{ utterance: "I work in this team since 2019 and I like it a lot.", expect: { kind: "reply", issues: "minor-only" } }],
  },
  {
    name: "first-language word: a new word, not a mistake",
    rule: "Saying a word in Portuguese is allowed: the tutor gives the English word and written help, without correcting.",
    mode: "presentation",
    turns: [
      {
        utterance: "We built a system to follow the orçamento of each project.",
        expect: { kind: "reply", newWord: "orçamento", support: true, message: /budget/i },
      },
    ],
  },
  {
    name: "known new word now said in English: a correct use, never a mistake",
    rule: "A word once said in Portuguese, now said in English, counts as learned; it is never treated as a mistake.",
    mode: "presentation",
    knownNewWords: [{ original: "orçamento", correction: "budget", category: "new_word" }],
    turns: [
      { utterance: "We track the budget of each project every month.", expect: { kind: "reply", issues: "none", correctUse: "orçamento" } },
    ],
  },
  {
    name: "fluent utterance: nothing to correct",
    rule: "The tutor does not correct language a fluent speaker would accept.",
    mode: "daily",
    turns: [
      {
        utterance: "Yesterday I fixed the login bug, and today I'm going to review two pull requests. Nothing is blocking me.",
        expect: { kind: "reply", issues: "none" },
      },
    ],
  },
  {
    name: "known mistake repeated: hint",
    rule: "A mistake already in the bank pauses the talk with a hint, even when it is small.",
    mode: "free_talk",
    knownMistakes: [AGE],
    turns: [{ utterance: "I have 32 years and I live in Brazil.", expect: { kind: "hint", matchesKnownMistake: true } }],
  },
  {
    name: "known mistake avoided: counted as a correct use",
    rule: "Saying a known mistake correctly, without a hint, moves it toward mastered.",
    mode: "free_talk",
    knownMistakes: [AGE],
    turns: [
      { utterance: "I am 32 years old and I live in Brazil.", expect: { kind: "reply", issues: "none", correctUse: AGE.original } },
    ],
  },
  {
    name: "the tutor admits what it does not know",
    rule: "When the tutor does not know a fact about the learner's work, it says so instead of guessing.",
    mode: "presentation",
    turns: [
      {
        utterance: "Do you remember the name of the tool we chose for the reports last month?",
        expect: {
          kind: "reply",
          message: /(don't|do not|can't|cannot) (know|remember|recall)|not sure|no idea|remind me|wasn't there|don't have/i,
        },
      },
    ],
  },
  {
    name: "false friend: hint for a word that changes the meaning",
    rule: "A word that says something else (\"pretend\" for \"intend\") confuses the listener, so it gets a hint.",
    mode: "daily",
    turns: [{ utterance: "Today I pretend to finish the export feature.", expect: { kind: "hint", issues: "serious" } }],
  },
  {
    name: "false friend: hint, then the learner fixes it with other words",
    rule: "A fix in the learner's own words also resolves the pending correction.",
    mode: "presentation",
    turns: [
      { utterance: "Last week I assisted the meeting with the client.", expect: { kind: "hint", issues: "serious" } },
      { utterance: "Last week I went to the meeting with the client.", expect: { kind: "reply", selfCorrected: true } },
    ],
  },
  {
    name: "small grammar slip: noted, the talk goes on",
    rule: "A slip that does not hide the meaning is only saved for the summary.",
    mode: "review",
    turns: [{ utterance: "The client don't want more changes in this sprint.", expect: { kind: "reply", issues: "minor-only" } }],
  },
  {
    name: "missing subject: noted, the talk goes on",
    rule: "\"Is a big project\" (no \"it\") is a common, small mistake: noted, not paused.",
    mode: "presentation",
    turns: [{ utterance: "Is a big project, with people from five countries.", expect: { kind: "reply", issues: "minor-only" } }],
  },
  {
    name: "fluent technical talk: nothing to correct",
    rule: "Work jargon and informal speech a fluent colleague would use are not mistakes.",
    mode: "review",
    turns: [
      {
        utterance: "Honestly, it was a rough week. We rolled back the deploy because the p95 latency spiked, but it's fixed now.",
        expect: { kind: "reply", issues: "none" },
      },
    ],
  },
  {
    name: "no fix after a hint: a second, more specific hint",
    rule: "When the retry is still wrong, the next hint is more specific and still never gives the answer.",
    mode: "daily",
    turns: [
      { utterance: "Today I pretend to finish the export feature.", expect: { kind: "hint", issues: "serious" } },
      { utterance: "Yes, I pretend to finish it today.", expect: { kind: "hint", selfCorrected: false } },
    ],
  },
  {
    name: "placement: the interviewer only observes, never corrects",
    rule: "The placement interview gives no hint, even for a mistake that changes the meaning; it keeps the talk going.",
    mode: "placement",
    turns: [
      { utterance: "I am developer. I work in app for translate.", expect: { kind: "reply" } },
      { utterance: "Yesterday I pretend to finish the export, but I no can.", expect: { kind: "reply" } },
    ],
  },
  {
    name: "B1 support: the start of a sentence when the learner is stuck",
    rule: "At B1, when the learner is stuck, the tutor gives only the start of a sentence to finish, never the whole answer.",
    mode: "daily",
    step: "supported",
    turns: [
      { utterance: "Hmm, yesterday I... I don't know how to say it.", expect: { kind: "reply", stuck: true, scaffold: true } },
      { utterance: "Yesterday I worked on the export of reports.", expect: { stuck: false } },
    ],
  },
  {
    name: "A1 guided track: repeat the model, then say it with your own information",
    rule: "At A1 a goal starts with a short model sentence to repeat; after the repetition the tutor asks for the same sentence with the learner's own information.",
    mode: "daily",
    step: "build_full",
    openingGivesWords: true,
    turns: [
      { utterance: "Yesterday I worked on the login screen.", expect: { kind: "reply", stage: "swap", scaffold: true } },
      { utterance: "Yesterday I worked on the report export.", expect: { kind: "reply", stage: "extend", scaffold: true } },
    ],
  },
  {
    name: "A2 guided track: the model comes only when the learner is stuck",
    rule: "At A2 the tutor asks the meeting question first and gives a model sentence only when the learner can't answer.",
    mode: "daily",
    step: "build_light",
    turns: [{ utterance: "Hmm... I don't know how to say.", expect: { kind: "reply", stuck: true, stage: "model", scaffold: true } }],
  },
  {
    name: "B2 conversation: no words to say, even when stuck",
    rule: "From B2 up, the tutor helps only with hints and first-language words; it never gives sentences to say.",
    mode: "daily",
    step: "conversation",
    turns: [{ utterance: "I don't know what to say.", expect: { kind: "reply", stuck: true, scaffold: false } }],
  },
];

/** The golden sessions: a quick check that the tutor works (hint and self-correction, new word, no false alarm). */
export const SCENARIOS: Scenario[] = ALL_SCENARIOS.filter((s) =>
  [
    "serious mistake: hint, then the learner fixes it",
    "first-language word: a new word, not a mistake",
    "fluent utterance: nothing to correct",
    "placement: the interviewer only observes, never corrects",
    "B1 support: the start of a sentence when the learner is stuck",
    "A1 guided track: repeat the model, then say it with your own information",
  ].includes(s.name),
);
