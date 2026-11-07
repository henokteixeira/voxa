import { decide, type PolicyDecision, type TutorVerdict } from "../domain/conversation/correction-policy.js";
import type { ChatTurn, PendingCorrection } from "../domain/conversation/types.js";
import type { TutorPort } from "../domain/ports/tutor.port.js";
import type { Scenario } from "./scenarios.js";

export interface TurnRecord {
  utterance: string;
  pendingBefore: PendingCorrection | null;
  verdict: TutorVerdict;
  decision: PolicyDecision;
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
  const context = { mode: scenario.mode, language: "en", learnerContext };
  const opening = await tutor.open(context);
  const history: ChatTurn[] = [{ role: "assistant", content: opening }];
  let pending: PendingCorrection | null = null;
  const turns: TurnRecord[] = [];

  for (const { utterance } of scenario.turns) {
    const verdict = await tutor.evaluate({
      ...context,
      history: [...history],
      pending,
      knownMistakes: scenario.knownMistakes ?? [],
      knownNewWords: [],
      utterance,
    });
    const decision = decide(pending, verdict);
    turns.push({ utterance, pendingBefore: pending, verdict, decision });
    history.push({ role: "user", content: utterance }, { role: "assistant", content: decision.message });
    pending = decision.nextPending;
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
