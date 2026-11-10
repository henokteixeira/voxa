/** The check-in's fixed task, the same every 2 weeks. */
export const CHECK_IN_TASK = "present_project";

/**
 * The topics of the check-in's second task (1 minute, never prepared), given in this order, each once; then the one
 * given longest ago. Their wording lives in the web app's copy.
 */
export const CHECK_IN_TOPICS = [
  "last_weekend",
  "problem_solved",
  "explain_skill",
  "change_wanted",
  "place_remembered",
  "person_admired",
  "next_month",
  "recommendation",
  "childhood_memory",
  "hard_decision",
] as const;
export type CheckInTopic = (typeof CHECK_IN_TOPICS)[number];

export function isCheckInTopic(task: string): task is CheckInTopic {
  return (CHECK_IN_TOPICS as readonly string[]).includes(task);
}
