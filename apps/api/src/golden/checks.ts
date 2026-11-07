import { sameText } from "../application/conversation.service.js";
import { isSerious } from "../domain/conversation/correction-policy.js";
import type { TurnRecord } from "./run-scenario.js";
import type { TurnExpectation } from "./scenarios.js";

const MARKDOWN = /[*`]|^\s*(#+|[-•]|\d+[.)])\s/m;
const EMOJI = /\p{Extended_Pictographic}/u;
/** Phrases that grade the learner's words. Talk about bugs ("what went wrong?") is fine. */
const JUDGING =
  /\b(that|this|your) (sentence |answer |phrase )?(was|is|'s) (wrong|incorrect|bad|not right)\b|\byou made an? (error|mistake)\b/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word match, so a one-word correction like "in" is not found inside "think". */
const contains = (text: string, part: string) =>
  new RegExp(`(^|[^\\p{L}])${escape(part.trim())}($|[^\\p{L}])`, "iu").test(text);

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

  // Prompt compliance: the hints the learner hears help find the fix alone, so they never carry it.
  // (The policy would replace a leaking hint with a generic one, which helps less.)
  const serious = pendingBefore ? undefined : verdict.issues.find(isSerious);
  if (serious && contains(serious.hint, serious.correction)) failures.push(`hint gives the answer away: "${serious.hint}"`);
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
  if (expect.support && !turn.support) failures.push("no on-screen help shown");
  if (expect.correctUse && !verdict.correctUses.some((u) => sameText(u, expect.correctUse ?? ""))) {
    failures.push(`"${expect.correctUse}" is not listed as a correct use`);
  }
  if (expect.stuck !== undefined && verdict.stuck !== expect.stuck) {
    failures.push(`stuck: expected ${expect.stuck}, got ${verdict.stuck}`);
  }
  if (expect.scaffold === true) {
    if (!turn.scaffold) failures.push("no words given to say");
    else if (!contains(decision.message, turn.scaffold.replace(/[.…]+$/, ""))) {
      failures.push(`the words to say are not in the spoken line: "${turn.scaffold}"`);
    }
  }
  if (expect.scaffold === false && turn.scaffold) failures.push(`words given to say: "${turn.scaffold}"`);
  if (expect.message && !expect.message.test(decision.message)) {
    failures.push(`spoken line does not match ${expect.message}: "${decision.message}"`);
  }
  return failures;
}
