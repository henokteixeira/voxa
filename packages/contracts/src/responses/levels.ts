import type { CefrLevel } from "../modes.js";
import type { LevelSource } from "../values.js";

/** The learner's speaking level, an estimate that picks how much help sessions give. */
export interface SpeakingLevel {
  language: string;
  level: CefrLevel;
  source: LevelSource;
  /** The learner's own lines that back the estimate. */
  evidence: string[];
  /** ISO 8601 date-time. */
  assessedAt: string;
}

export interface LevelView {
  current: (SpeakingLevel & { step: string }) | null;
  /** Suggest a placement interview: never done, or the last one is 4 weeks old. */
  placementDue: boolean;
  /** A different support step the last sessions point to; the learner confirms it. Missing from older servers. */
  proposal?: StepChangeProposal | null;
}

export interface StepChangeProposal {
  direction: "up" | "down";
  to: CefrLevel;
  /** The newest session the proposal rests on: a later session makes it a new proposal. */
  basedOn: string;
}
