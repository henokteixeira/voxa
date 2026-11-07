import { safeSupport } from "../application/conversation.service.js";
import {
  decide,
  type PolicyDecision,
  type TutorVerdict,
  verdictForMode,
} from "../domain/conversation/correction-policy.js";
import { GOAL_DESCRIPTIONS, goalsFor, mergeCovered } from "../domain/conversation/session-goals.js";
import { keptScaffold, sessionStep } from "../domain/conversation/support.js";
import type { ChatTurn, PendingCorrection } from "../domain/conversation/types.js";
import type { TutorPort } from "../domain/ports/tutor.port.js";
import type { Scenario } from "./scenarios.js";

export interface TurnRecord {
  utterance: string;
  pendingBefore: PendingCorrection | null;
  verdict: TutorVerdict;
  decision: PolicyDecision;
  /** The on-screen help the learner sees, after the same filter the service applies. */
  support: string | null;
  /** The words given to say next, after the same filter the service applies. */
  scaffold: string | null;
}

export interface Transcript {
  opening: string;
  turns: TurnRecord[];
}

/**
 * Plays a scripted conversation against a tutor, keeping history and the pending correction
 * the same way ConversationService does, but without a database.
 */
export async function runScenario(tutor: TutorPort, scenario: Scenario, learnerContext: string): Promise<Transcript> {
  const context = {
    mode: scenario.mode,
    language: "en",
    learnerContext,
    goals: goalsFor(scenario.mode).map((id) => ({ id, description: GOAL_DESCRIPTIONS[id] })),
    targets: [],
    step: scenario.step ?? sessionStep(scenario.mode, null),
  };
  const opening = await tutor.open(context);
  const history: ChatTurn[] = [{ role: "assistant", content: opening }];
  let pending: PendingCorrection | null = null;
  let coveredGoals: string[] = [];
  let scaffold: string | null = null;
  const turns: TurnRecord[] = [];

  for (const { utterance } of scenario.turns) {
    const verdict = await tutor.evaluate({
      ...context,
      history: [...history],
      pending,
      knownMistakes: scenario.knownMistakes ?? [],
      knownNewWords: scenario.knownNewWords ?? [],
      utterance,
      coveredGoals,
      scaffold,
    });
    const decision = decide(pending, verdictForMode(scenario.mode, verdict));
    const support = safeSupport(verdict.support, decision.nextPending?.correction);
    const given = decision.kind === "reply" ? keptScaffold(context.step, verdict) : null;
    turns.push({ utterance, pendingBefore: pending, verdict, decision, support, scaffold: given });
    scaffold = given;
    history.push({ role: "user", content: utterance }, { role: "assistant", content: decision.message });
    pending = decision.nextPending;
    coveredGoals = mergeCovered(scenario.mode, coveredGoals, verdict.coveredGoals);
  }
  return { opening, turns };
}

/** Readable transcript for a failure report. */
export function formatTranscript(transcript: Transcript): string {
  const lines = [`Tutor: ${transcript.opening}`];
  for (const turn of transcript.turns) {
    lines.push(`Learner: ${turn.utterance}`);
    lines.push(`Tutor (${turn.decision.kind}): ${turn.decision.message}`);
    lines.push(`  verdict: ${JSON.stringify(turn.verdict)}`);
  }
  return lines.join("\n");
}
