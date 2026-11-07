import type { ChatTurn } from "../../domain/conversation/types.js";

/**
 * CEFR global descriptors for speaking, shortened from the "can do" self-assessment grid
 * (Council of Europe; e.g. https://www.kcl.ac.uk/language-centre/assets/can-do-statements-cefr.pdf).
 */
const SPEAKING_DESCRIPTORS = [
  "A1: interacts in a simple way if the other person repeats, rephrases slowly and helps; asks and answers " +
    "simple questions on very familiar topics; uses simple phrases about where they live and people they know.",
  "A2: communicates in simple, routine exchanges of information on familiar topics; handles very short " +
    "exchanges but can't usually keep the conversation going alone; describes their job and background in " +
    "simple terms with a series of phrases.",
  "B1: enters unprepared into conversation on familiar topics such as work; connects phrases simply to " +
    "describe experiences and events; briefly gives reasons and explanations for opinions and plans.",
  "B2: interacts with a degree of fluency and spontaneity that makes regular talk with fluent speakers " +
    "possible; takes an active part in discussion, sustaining their views; gives clear, detailed descriptions " +
    "in their field; explains a viewpoint with advantages and disadvantages.",
  "C1: expresses themselves fluently and spontaneously without much obvious searching for expressions; " +
    "uses language flexibly for professional purposes; presents complex subjects clearly, developing points " +
    "and rounding off with a conclusion.",
  "C2: takes part effortlessly in any conversation, with a good grasp of idioms; expresses finer shades of " +
    "meaning precisely; presents a clear, smoothly flowing description or argument.",
];

export function buildAssessmentPrompt(language: string): string {
  return [
    `You estimate a learner's speaking level in ${language} (BCP 47 code) on the CEFR scale, from a placement ` +
      "interview transcript. The learner's lines come from speech recognition: ignore punctuation and " +
      "capitalization. Words in another language mean they did not know the words in " +
      `${language}; weigh how much they needed that.`,
    `## CEFR speaking descriptors\n${SPEAKING_DESCRIPTORS.map((d) => `- ${d}`).join("\n")}`,
    [
      "## How to decide",
      "- `level`: the highest level whose descriptor the learner sustained across the interview, not one good " +
        "sentence. When unsure between two levels, choose the lower one: the level only picks how much help " +
        "the next sessions give, and too little help is worse than too much.",
      "- `evidence`: two or three of the learner's own sentences (at least three words each) that show the level best, copied exactly from " +
        "the transcript. Never write sentences of your own.",
    ].join("\n"),
  ].join("\n\n");
}

/** The transcript, one line per turn, labelled by speaker. */
export function buildTranscript(turns: ChatTurn[]): string {
  return turns.map((t) => `${t.role === "user" ? "Learner" : "Interviewer"}: ${t.content}`).join("\n");
}
