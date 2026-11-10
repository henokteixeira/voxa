import type { FactTopic } from "../values.js";

/** Something the learner told the tutor; the tutor brings it up in later sessions. */
export interface LearnerFact {
  id: string;
  topic: FactTopic;
  /** One short sentence in English, in the third person. */
  statement: string;
  learnedAt: string;
  updatedAt: string;
}
