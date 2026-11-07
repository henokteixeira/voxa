import { isSerious } from "../domain/conversation/correction-policy.js";
import type { TurnRecord } from "./run-scenario.js";
import type { TurnExpectation } from "./scenarios.js";

const MARKDOWN = /[*#`]|^\s*([-•]|\d+[.)])\s/m;
const EMOJI = /\p{Extended_Pictographic}/u;
/** Words that grade the learner. The tutor never says a sentence was wrong. */
const JUDGING = /\b(wrong|incorrect|error)\b/i;

const contains = (text: string, part: string) => text.toLowerCase().includes(part.trim().toLowerCase());

/** Rules for any line that is read aloud. */
export function checkSpoken(label: string, text: string): string[] {
  const failures: string[] = [];
  if (!text.trim()) failures.push(`${label} is empty`);
  if (MARKDOWN.test(text)) failures.push(`${label} has markdown: "${text}"`);
  if (EMOJI.test(text)) failures.push(`${label} has an emoji: "${text}"`);
  if (JUDGING.test(text)) failures.push(`${label} judges the learner: "${text}"`);
  return failures;
}

/** Failures for one turn: the rules every turn follows, plus the scenario's expectation. */
export function checkTurn(turn: TurnRecord, expect: TurnExpectation): string[] {
  const { verdict, decision, pendingBefore } = turn;
  const failures = checkSpoken("spoken line", decision.message);

  // Hints help the learner find the fix alone, so the tutor's own hints never carry it.
  for (const issue of verdict.issues) {
    if (contains(issue.hint, issue.correction)) failures.push(`hint gives the answer away: "${issue.hint}"`);
  }
  if (pendingBefore && verdict.nextHint && contains(verdict.nextHint, pendingBefore.correction)) {
    failures.push(`next hint gives the answer away: "${verdict.nextHint}"`);
  }
  const target = decision.nextPending?.correction;
  if (target && verdict.support && contains(verdict.support, target)) {
    failures.push(`on-screen help gives the answer away: "${verdict.support}"`);
  }

  if (expect.kind && decision.kind !== expect.kind) failures.push(`kind: expected ${expect.kind}, got ${decision.kind}`);
  if (expect.selfCorrected !== undefined && decision.selfCorrected !== expect.selfCorrected) {
    failures.push(`selfCorrected: expected ${expect.selfCorrected}, got ${decision.selfCorrected}`);
  }
  if (expect.issues) {
    const found = verdict.issues.length === 0 ? "none" : verdict.issues.some(isSerious) ? "serious" : "minor-only";
    if (found !== expect.issues) failures.push(`issues: expected ${expect.issues}, got ${found}`);
  }
  if (expect.matchesKnownMistake && !verdict.issues.some((i) => i.matchesKnownMistake)) {
    failures.push("no issue matched the known mistake");
  }
  if (expect.newWord) {
    const word = expect.newWord;
    if (!verdict.newWords.some((w) => contains(w.said, word))) failures.push(`"${word}" is not listed as a new word`);
    if (verdict.issues.some((i) => contains(i.original, word))) failures.push(`"${word}" was treated as a mistake`);
  }
  if (expect.support && !verdict.support?.trim()) failures.push("no on-screen help");
  if (expect.correctUse && !verdict.correctUses.some((u) => contains(u, expect.correctUse ?? ""))) {
    failures.push(`"${expect.correctUse}" is not listed as a correct use`);
  }
  if (expect.message && !expect.message.test(decision.message)) {
    failures.push(`spoken line does not match ${expect.message}: "${decision.message}"`);
  }
  return failures;
}
