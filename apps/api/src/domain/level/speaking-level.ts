/**
 * The learner's speaking level on the CEFR scale, and the support step it starts sessions at.
 * The level is an estimate (the tutor reading what the learner said against the CEFR descriptors,
 * or the learner's own correction), never a certificate: it only picks how much help to give.
 */
import { CEFR_LEVELS, type CefrLevel, LEVEL_SOURCES, type LevelSource } from "@voxa/contracts";

export { CEFR_LEVELS, type CefrLevel, LEVEL_SOURCES, type LevelSource };

/**
 * How much help a session gives (leveling and guided track design, approved by the learner on 2026-11-07):
 * build_full (A1) = the guided track in full; build_light (A2) = the track, with the model only when he can't answer;
 * supported (B1) = free conversation, the start of a sentence when he gets stuck; conversation (B2) = as before;
 * demanding (C1, C2) = as before, with harder questions.
 */
export const SUPPORT_STEPS = ["build_full", "build_light", "supported", "conversation", "demanding"] as const;
export type SupportStep = (typeof SUPPORT_STEPS)[number];

const STEP_BY_LEVEL: Record<CefrLevel, SupportStep> = {
  A1: "build_full",
  A2: "build_light",
  B1: "supported",
  B2: "conversation",
  C1: "demanding",
  C2: "demanding",
};

export function isSupportStep(value: unknown): value is SupportStep {
  return typeof value === "string" && (SUPPORT_STEPS as readonly string[]).includes(value);
}

export function supportStepFor(level: CefrLevel): SupportStep {
  return STEP_BY_LEVEL[level];
}

export interface SpeakingLevel {
  language: string;
  level: CefrLevel;
  source: LevelSource;
  /** A few of the learner's own sentences that back the estimate (empty when set by hand). */
  evidence: string[];
  assessedAt: Date;
}

/** A new placement is suggested this long after the last one (a design choice, confirmed by the learner). */
export const PLACEMENT_INTERVAL_DAYS = 28;

/** Whether to suggest a placement session: never placed, or the last placement is older than the interval. */
export function placementDue(lastPlacementAt: Date | null, now: Date): boolean {
  if (!lastPlacementAt) return true;
  return now.getTime() - lastPlacementAt.getTime() >= PLACEMENT_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
}
