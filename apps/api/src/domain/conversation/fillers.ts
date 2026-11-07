/**
 * Short lines the tutor says while it prepares an answer, so the wait does not feel empty.
 * Warm and neutral: none of them judges what the learner said (no "Good!" or "Great!").
 * Keyed by primary language subtag; a language without lines plays nothing.
 */
const FILLER_LINES: Record<string, readonly string[]> = {
  en: ["Mm-hmm, let me think.", "Okay, give me a second.", "Got it.", "Hmm, okay.", "Right, let me see."],
};

/** The filler lines for a BCP 47 tag ("en-US" → the English lines); empty when there are none. */
export function fillerLinesFor(language: string): readonly string[] {
  return FILLER_LINES[language.split("-")[0].toLowerCase()] ?? [];
}
