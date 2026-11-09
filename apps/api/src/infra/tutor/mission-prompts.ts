import type { SupportStep } from "../../domain/level/speaking-level.js";
import type { MissionSituation } from "../../domain/mission/mission.js";
import type { NewMissionExpression } from "../../domain/mission/mission.js";
import type { ModelRequest } from "../../domain/ports/mission-coach.port.js";

/** What the speaker of each situation's model does: the same task the learner does next. */
export const MODEL_TASKS: Record<MissionSituation, string> = {
  daily: "gives their update in the team's daily stand-up: what they did yesterday, what they will do today, and whether anything blocks them",
  my_day: "tells a friend about their usual day, something that happened to them recently, and their plans",
  presentation: "presents one of their projects to a sponsor: what it does, who it serves, a key decision and its current status",
  story: "tells a friend a short story from their life: when and where it happened, what happened next and how it ended",
  review: "demos work they finished in a sprint review: the problem, the change, how it was tested and what comes next",
  opinion: "gives their opinion on an everyday topic (for example remote work or social media), why they think so, and one point of view they disagree with",
};

/** How the model is said at each support step, so the learner hears language just above their own. */
export const MODEL_LEVELS: Record<SupportStep, string> = {
  build_full: "The learner is a beginner (about CEFR A1): very short, simple sentences (five to eight words), common words, about 70 words.",
  build_light: "The learner speaks at about CEFR A2: short, simple sentences (up to twelve words), common words, about 100 words.",
  supported: "The learner speaks at about CEFR B1: clear, natural sentences, everyday words, about 130 words.",
  conversation: "The learner speaks at about CEFR B2: natural speech with common idioms, about 150 words.",
  demanding: "The learner is advanced (CEFR C1 or above): natural, fluent speech with some richer vocabulary, about 160 words.",
};

export function buildModelPrompt(language: string): string {
  return [
    `You write a short spoken model for a learner of ${language} (BCP 47). The learner listens to it before doing the same task, so it ` +
      "shows how a fluent speaker does it, without being a script to copy.",
    "`speaker`: a first name for the person speaking (a colleague or a friend, not the learner).",
    "`text`: what they say, in the first person, as natural speech said aloud in about one minute: no headings, lists or stage directions. " +
      "It is about the speaker's own life or work, close to the learner's world but never the learner's own facts.",
    "`expressions`: exactly 3 ready-made chunks from `text` that the learner can reuse in their own version of the task (for example " +
      "\"I'm still working on…\" or \"The main reason is…\"). Each `phrase` is the fixed part only, as it appears in the text, ending in " +
      "\"…\" where the learner's own words go. `example` is the sentence of `text` that uses it, exactly as written. Pick chunks that are " +
      "common in this kind of talk and useful at the learner's level, not rare words.",
  ].join("\n");
}

export function buildModelMessage({ situation, step, learnerContext }: ModelRequest): string {
  const about = learnerContext.trim() || "No details given: use common software team situations.";
  return [
    `<task>\nThe speaker ${MODEL_TASKS[situation]}.\n</task>`,
    `<level>\n${MODEL_LEVELS[step]}\n</level>`,
    `<about_the_learner>\n${about}\n</about_the_learner>`,
  ].join("\n");
}

export function buildUsedPrompt(language: string): string {
  return [
    `You check one spoken sentence from a learner of ${language} (BCP 47) who was asked to use a ready-made expression in a ` +
      "sentence of their own.",
    "The text comes from speech recognition: ignore punctuation, capitalization and filler words.",
    "`used`: true when the sentence uses the expression (small changes such as a contraction or a different tense count) with " +
      "words of the learner's own, even with other small mistakes. False when the expression is missing, the sentence only " +
      "repeats the model's example, or it is mostly in another language.",
  ].join("\n");
}

export function buildUsedMessage(expression: Pick<NewMissionExpression, "phrase" | "example">, utterance: string): string {
  return [
    `<expression>\n${expression.phrase}\n</expression>`,
    `<model_example>\n${expression.example}\n</model_example>`,
    `<learner_sentence>\n${utterance}\n</learner_sentence>`,
  ].join("\n");
}
