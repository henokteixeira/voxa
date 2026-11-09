import type { ReviewCue } from "../../domain/ports/review-coach.port.js";
import type { ReviewItem } from "../../domain/ports/review.repository.js";
import { NEW_WORD_CATEGORY } from "../../domain/conversation/types.js";
import { EXPRESSION_CATEGORY } from "../../domain/mission/mission.js";

function describeItem(item: ReviewItem): string {
  const sentences = item.examples.map((e) => `- "${e.original}" → "${e.correction}"`).join("\n");
  if (item.category === EXPRESSION_CATEGORY) {
    return `<expression>\n"${item.name}" (a ready-made expression the learner took from a model that said: "${item.rule}")\n</expression>`;
  }
  return item.category === NEW_WORD_CATEGORY
    ? `<new_word>\n"${item.name}" (the learner once said "${item.rule}" in their first language)\n</new_word>`
    : `<pattern>\n${item.name} (${item.category}): ${item.rule}\nThe learner's sentences that broke it:\n${sentences}\n</pattern>`;
}

export function buildCuePrompt(language: string, firstLanguage: string): string {
  return [
    `You write one review cue for a learner of spoken ${language} (BCP 47) whose first language is ${firstLanguage}.`,
    `\`cue\`: one short, natural sentence in ${firstLanguage} (at most 15 words) the learner will say in ${language}. ` +
      "It must need the pattern, new word or expression given, be about the learner's life or work, and differ from the learner's " +
      "own sentences, so they practice the rule and not one sentence.",
    `\`answer\`: one simple, natural way to say it in ${language}, as a fluent speaker would say it in conversation.`,
  ].join("\n");
}

export function buildCueMessage(item: ReviewItem, learnerContext: string): string {
  const about = learnerContext.trim() || "No details given: use common software team situations.";
  return `${describeItem(item)}\n<about_the_learner>\n${about}\n</about_the_learner>`;
}

export function buildCheckPrompt(language: string): string {
  return [
    `You check one spoken answer in a review for a learner of ${language} (BCP 47).`,
    "The text comes from speech recognition: ignore punctuation, capitalization and filler words.",
    "`recalled`: true when the answer says what the cue asks and uses the pattern, new word or expression given correctly, " +
      "even with other words than the answer given. Other small slips do not count against it. False when the " +
      "pattern, word or expression is wrong or missing, or the answer is mostly in another language.",
  ].join("\n");
}

export function buildCheckMessage(item: ReviewItem, cue: ReviewCue, utterance: string): string {
  return [
    describeItem(item),
    `<cue>\n${cue.cue}\n</cue>`,
    `<one_good_answer>\n${cue.answer}\n</one_good_answer>`,
    `<learner_answer>\n${utterance}\n</learner_answer>`,
  ].join("\n");
}
