import { isSerious, type TutorVerdict } from "../domain/conversation/correction-policy.js";
import { samePhrase, sameText } from "../domain/conversation/text.js";
import { NEW_WORD_CATEGORY, type PendingCorrection, type PracticeTarget } from "../domain/conversation/types.js";
import { cleanPattern } from "../domain/mistakes/pattern.js";
import type { Mistake, MistakeRepository } from "../domain/ports/mistake.repository.js";
import type { ReviewSubject } from "../domain/ports/review.repository.js";
import { type ReviewScheduler, reviewSubject } from "./review-scheduler.js";

export interface TurnLearning {
  sessionId: string;
  language: string;
  /** The correction the learner was retrying this turn, if any. */
  pending: PendingCorrection | null;
  /** The mistakes to record, with their real severity (before the mode or track softened them). */
  issues: TutorVerdict["issues"];
  verdict: Pick<TutorVerdict, "issues" | "correctUses" | "newWords" | "usedExpressions">;
  /** Mistakes the tutor was watching for: the bank's most frequent ones and the session's targets. */
  watched: readonly Pick<PracticeTarget, "original">[];
  /** Expressions due for review the tutor watched for: one used counts as its review. Empty on a helped turn. */
  dueExpressions: readonly { id: string; phrase: string }[];
  /** The learner fixed the pending mistake alone. */
  selfCorrected: boolean;
  /** This turn's number among the learner's turns in the session (1 = first answer). */
  learnerTurn: number;
  now: Date;
}

/** Stores what one turn taught about the learner: mistakes, correct uses, new words and self-corrections. */
export async function recordTurnLearning(
  mistakes: MistakeRepository,
  reviews: ReviewScheduler,
  turn: TurnLearning,
): Promise<void> {
  const { sessionId, language, pending, verdict, now, learnerTurn } = turn;
  const isPending = (text: string) => pending !== null && sameText(text, pending.original);
  // Two mistakes of one pattern in a turn are one miss, so the schedule moves once per subject.
  const made = new Map<string, ReviewSubject>();
  const noteMade = (saved: Mistake | null) => {
    const subject = saved && reviewSubject(saved);
    if (subject) made.set(`${subject.kind}:${subject.id}`, subject);
  };

  // Every mistake goes to the bank, except a retry of the one already pending.
  for (const issue of turn.issues) {
    if (pending && (sameText(issue.correction, pending.correction) || isPending(issue.original))) continue;
    const saved = await mistakes.record(
      {
        language,
        original: issue.original,
        correction: issue.correction,
        category: issue.category,
        pattern: cleanPattern(issue.pattern),
      },
      { sessionId, severity: isSerious(issue) ? "serious" : "minor", learnerTurn },
    );
    noteMade(saved);
  }
  // Correct uses of known mistakes, except the retry of the pending one (that came after a hint).
  for (const used of verdict.correctUses) {
    const mistake = turn.watched.find((m) => sameText(m.original, used));
    if (!mistake || isPending(mistake.original)) continue;
    const counted = await mistakes.recordCorrectUse(sessionId, { language, original: mistake.original });
    const subject = counted && reviewSubject(counted);
    if (subject) await reviews.usedCorrectly(language, subject, now);
  }
  // A due expression used in a sentence of one's own is recalled, as in a review.
  for (const used of verdict.usedExpressions) {
    const expression = turn.dueExpressions.find((e) => samePhrase(e.phrase, used));
    if (expression) await reviews.usedCorrectly(language, { kind: "expression", id: expression.id }, now);
  }
  // A new word is never a mistake: skip one the tutor also listed as an issue, the pending one, or a repeat.
  const taken = [...verdict.issues.map((i) => i.original), ...(pending ? [pending.original] : [])];
  for (const word of verdict.newWords) {
    if (taken.some((t) => sameText(t, word.said))) continue;
    taken.push(word.said);
    const saved = await mistakes.record(
      { language, original: word.said, correction: word.words, category: NEW_WORD_CATEGORY, pattern: null },
      { sessionId, severity: "minor", learnerTurn },
    );
    noteMade(saved);
  }
  // Making it again brings its review closer.
  for (const subject of made.values()) await reviews.made(language, subject, now);
  if (turn.selfCorrected && pending) {
    await mistakes.markSelfCorrected(sessionId, { language, original: pending.original });
  }
}
