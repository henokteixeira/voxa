import type { ChatTurn } from "../../domain/conversation/types.js";
import type { Mode } from "../../domain/conversation/mode.js";
import { FACT_TOPICS, type LearnerFact } from "../../domain/memory/learner-fact.js";

/** Stable, so it can be cached. */
export function buildMemoryPrompt(): string {
  return [
    "You read the transcript of a speaking practice session between a tutor and a learner, after it ended.",
    "Find what the learner said about their real life, so the tutor can remember it in later sessions.",
    "",
    "## Facts",
    "- Keep only facts the learner said about themselves, as true: their work, company, role, projects, team " +
      "and the people around them, interests, life (where they live, family, routine) and goals.",
    "- Some sessions are role plays of work meetings. Leave out details that sound made up for the scene, " +
      "and anything the learner was unsure of.",
    "- The learner may speak a second language with mistakes, or switch to their first language: read the meaning.",
    "- Never keep facts that only the tutor said, and never keep sensitive details (health, religion beyond " +
      "what their work is, money, passwords, contact details).",
    "- Write each fact in English, in the third person, as one short sentence without the subject: " +
      '"Works as a software engineer at a mission organization."',
    `- \`topic\`, one of: ${FACT_TOPICS.map((t) => `\`${t}\``).join(", ")}.`,
    "- Check the known facts first. Do not add a fact that a known one already says.",
    "- When the learner changed a known fact (a new project, a new team), put it in `updated` with the known " +
      "fact's id and the new sentence. Leave every other known fact out.",
    "- Most sessions add zero to three facts. When nothing new was said, return empty lists.",
    "",
    "## Recap",
    "`recap`: one short sentence in English on what the learner talked about, for the tutor to recall later " +
      '("Gave the daily update: fixed the upload bug, blocked on the API review."). Null when the learner said ' +
      "almost nothing.",
  ].join("\n");
}

const MODE_NAMES: Record<Mode, string> = {
  presentation: "project presentation (role play)",
  free_talk: "free conversation",
  daily: "daily stand-up (role play)",
  review: "review meeting (role play)",
  placement: "speaking level interview",
};

export function buildMemoryMessage(mode: Mode, turns: ChatTurn[], known: LearnerFact[]): string {
  const facts = known.length
    ? known.map((f) => `- ${f.id} (${f.topic}): ${f.statement}`).join("\n")
    : "None yet.";
  const transcript = turns.map((t) => `${t.role === "user" ? "Learner" : "Tutor"}: ${t.content}`).join("\n");
  return [
    `<session_type>${MODE_NAMES[mode]}</session_type>`,
    `<known_facts>\n${facts}\n</known_facts>`,
    `<transcript>\n${transcript}\n</transcript>`,
  ].join("\n\n");
}
