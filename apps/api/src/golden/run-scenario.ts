import { safeSupport } from "../domain/conversation/text.js";
import {
  decide,
  type PolicyDecision,
  type TutorVerdict,
  verdictForMode,
} from "../domain/conversation/correction-policy.js";
import {
  givesWords,
  nextGoalAfter,
  openingPlan,
  resolveTrackTurn,
  startTrack,
  type TrackStage,
  trackOutcomes,
  turnPlan,
} from "../domain/conversation/guided-track.js";
import { describeGoal, GOAL_DESCRIPTIONS, goalsFor, mergeCovered } from "../domain/conversation/session-goals.js";
import { keptScaffold, sessionStep, surprisesAllowed } from "../domain/conversation/support.js";
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
  /** In the script: the stage the learner is at after this turn. */
  stage: TrackStage | null;
}

export interface Transcript {
  opening: string;
  /** Words the opening gave the learner to say (the script's first step). */
  openingScaffold: string | null;
  turns: TurnRecord[];
}

/**
 * Plays a scripted conversation against a tutor, keeping history and the pending correction
 * the same way TurnService does, but without a database.
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
  const step = context.step;
  let track = startTrack(step, goalsFor(scenario.mode));
  const opened = await tutor.open(context, track ? openingPlan(track, describeGoal) : null);
  const opening = opened.line;
  const history: ChatTurn[] = [{ role: "assistant", content: opening }];
  let pending: PendingCorrection | null = null;
  let coveredGoals: string[] = [];
  let scaffold: string | null = track && givesWords(track) ? opened.scaffold : null;
  const openingScaffold = scaffold;
  const turns: TurnRecord[] = [];

  for (const { utterance } of scenario.turns) {
    const current = track;
    const outcomes = current ? trackOutcomes(current, nextGoalAfter(goalsFor(scenario.mode), current.goal, coveredGoals)) : null;
    const verdict = await tutor.evaluate({
      ...context,
      history: [...history],
      pending,
      knownMistakes: scenario.knownMistakes ?? [],
      knownNewWords: scenario.knownNewWords ?? [],
      knownPatterns: [],
      focusPatterns: [],
      reviewExpressions: [],
      bringBack: [],
      utterance,
      coveredGoals,
      scaffold,
      step,
      plan: outcomes ? turnPlan(outcomes, describeGoal) : null,
      surprises: !current && surprisesAllowed(step, { total: 0, assisted: 0 }),
    });
    const byMode = verdictForMode(scenario.mode, verdict);
    const decision = decide(pending, byMode);
    const inTrack = outcomes
      ? resolveTrackTurn({
          outcomes,
          replied: decision.kind === "reply",
          verdict: { stuck: verdict.stuck, scaffold: verdict.scaffold, keyWords: verdict.keyWords ?? [] },
        })
      : null;
    const move = inTrack?.move ?? null;
    const support = safeSupport(verdict.support, decision.nextPending?.correction);
    const given = inTrack ? inTrack.scaffold : decision.kind === "reply" ? keptScaffold(step, verdict) : null;
    if (move) track = move.track;
    turns.push({ utterance, pendingBefore: pending, verdict, decision, support, scaffold: given, stage: track?.stage ?? null });
    scaffold = given;
    history.push({ role: "user", content: utterance }, { role: "assistant", content: decision.message });
    pending = decision.nextPending;
    coveredGoals = mergeCovered(scenario.mode, coveredGoals, inTrack ? (move?.covered ? [move.covered] : []) : verdict.coveredGoals);
  }
  return { opening, openingScaffold, turns };
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
