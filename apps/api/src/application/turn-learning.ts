import { isSerious, type TutorVerdict } from "../domain/conversation/correction-policy.js";
import { sameText } from "../domain/conversation/text.js";
import { NEW_WORD_CATEGORY, type PendingCorrection, type PracticeTarget } from "../domain/conversation/types.js";
import type { MistakeRepository } from "../domain/ports/mistake.repository.js";

export interface TurnLearning {
  sessionId: string;
  language: string;
  /** The correction the learner was retrying this turn, if any. */
  pending: PendingCorrection | null;
  /** The mistakes to record, with their real severity (before the mode or track softened them). */
  issues: TutorVerdict["issues"];
  verdict: Pick<TutorVerdict, "issues" | "correctUses" | "newWords">;
  /** Mistakes the tutor was watching for: the bank's most frequent ones and the session's targets. */
  watched: readonly Pick<PracticeTarget, "original">[];
  /** The learner fixed the pending mistake alone. */
  selfCorrected: boolean;
}

/** Stores what one turn taught about the learner: mistakes, correct uses, new words and self-corrections. */
export async function recordTurnLearning(mistakes: MistakeRepository, turn: TurnLearning): Promise<void> {
  const { sessionId, language, pending, verdict } = turn;
  const isPending = (text: string) => pending !== null && sameText(text, pending.original);

  // Every mistake goes to the bank, except a retry of the one already pending.
  for (const issue of turn.issues) {
    if (pending && (sameText(issue.correction, pending.correction) || isPending(issue.original))) continue;
    await mistakes.record(
      { language, original: issue.original, correction: issue.correction, category: issue.category },
      { sessionId, severity: isSerious(issue) ? "serious" : "minor" },
    );
  }
  // Correct uses of known mistakes, except the retry of the pending one (that came after a hint).
  for (const used of verdict.correctUses) {
    const mistake = turn.watched.find((m) => sameText(m.original, used));
    if (!mistake || isPending(mistake.original)) continue;
    await mistakes.recordCorrectUse(sessionId, { language, original: mistake.original });
  }
  // A new word is never a mistake: skip one the tutor also listed as an issue, the pending one, or a repeat.
  const taken = [...verdict.issues.map((i) => i.original), ...(pending ? [pending.original] : [])];
  for (const word of verdict.newWords) {
    if (taken.some((t) => sameText(t, word.said))) continue;
    taken.push(word.said);
    await mistakes.record(
      { language, original: word.said, correction: word.words, category: NEW_WORD_CATEGORY },
      { sessionId, severity: "minor" },
    );
  }
  if (turn.selfCorrected && pending) {
    await mistakes.markSelfCorrected(sessionId, { language, original: pending.original });
  }
}
