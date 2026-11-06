/** Personal facts about the learner that make the scenes realistic. Kept outside the repository. */
export interface LearnerContextPort {
  load(): Promise<string>;
}

export const LEARNER_CONTEXT_PORT = Symbol("LEARNER_CONTEXT_PORT");
