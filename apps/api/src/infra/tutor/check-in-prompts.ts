/** The prompt that reads a check-in's transcript for mistakes, after the recording (no correction is shown during it). */
export function buildCheckInReadingPrompt(language: string): string {
  return [
    `You read the transcript of a learner presenting their project for 2 minutes in ${language} (BCP 47 code). ` +
      "The transcript comes from speech recognition: ignore punctuation, capitalization, hesitation sounds (uh, hmm, er) and " +
      "self-corrections the learner already fixed.",
    [
      "## What to list",
      "- `mistakes`: each grammar or word-choice mistake, once per place it happens, with what was said and the correct " +
        "form. Count only clear mistakes a teacher would mark; a sentence that is simple but correct has none. " +
        `Words in another language than ${language} are not mistakes here.`,
      `- \`otherLanguageWords\`: each word said in another language than ${language}, copied exactly. ` +
        `Names of people, places, products and organizations don't count.`,
    ].join("\n"),
  ].join("\n\n");
}
