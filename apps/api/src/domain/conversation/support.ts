import { type CefrLevel, type SupportStep, supportStepFor } from "../level/speaking-level.js";
import { correctsMistakes, type Mode } from "./mode.js";

/** Without a level yet, a session helps as before the levels existed: hints and first-language words only. */
export const STEP_WITHOUT_LEVEL: SupportStep = "conversation";

/** The support step a new session gives. The placement interview only observes, so it gives none. */
export function sessionStep(mode: Mode, level: CefrLevel | null): SupportStep | null {
  if (!correctsMistakes(mode)) return null;
  return level ? supportStepFor(level) : STEP_WITHOUT_LEVEL;
}

/**
 * Whether the tutor may give the learner words to say: a model sentence (the guided track, A1–A2)
 * or the start of a sentence to complete when the learner is stuck (B1).
 */
export function givesScaffold(step: SupportStep | null): boolean {
  return step === "build_full" || step === "build_light" || step === "supported";
}

/**
 * The words the tutor gave for the learner to say next, kept only where the step allows them.
 * At B1 they are only a way out when the learner is stuck.
 */
export function keptScaffold(step: SupportStep | null, verdict: { scaffold: string | null; stuck: boolean }): string | null {
  const text = verdict.scaffold?.trim() ?? "";
  if (!text || !givesScaffold(step)) return null;
  if (step === "supported" && !verdict.stuck) return null;
  return text;
}

/**
 * A learner turn counts as helped when it answered words the tutor gave (a model or a sentence start)
 * or used the first language. The share of turns without help is a fluency signal.
 */
export function wasAssisted(turn: { scaffoldBefore: string | null; usedFirstLanguage: boolean }): boolean {
  return turn.scaffoldBefore !== null || turn.usedFirstLanguage;
}
