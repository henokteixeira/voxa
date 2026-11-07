import { Inject, Injectable } from "@nestjs/common";
import { NEW_WORD_CATEGORY } from "../domain/conversation/types.js";
import { MISTAKE_TYPES } from "../domain/mistakes/mistake-type.js";
import { MISTAKE_BANK_REPOSITORY, type BankEntry, type MistakeBankRepository } from "../domain/ports/mistake-bank.repository.js";
import { REVIEW_REPOSITORY, type ReviewRepository, type ReviewSchedule } from "../domain/ports/review.repository.js";
import { reviewStatus, type ReviewStatus } from "../domain/review/review-schedule.js";

/** One sentence the learner said that broke a pattern. */
export interface PatternSentence {
  id: string;
  original: string;
  correction: string;
  occurrences: number;
  lastSeenAt: Date;
}

/** A pattern in the bank, with its sentences and where it is in the review schedule. */
export interface PatternView {
  id: string;
  category: string;
  name: string;
  rule: string;
  status: ReviewStatus;
  /** Null when the pattern has no schedule yet. */
  dueAt: Date | null;
  /** Times any of its sentences came up. */
  occurrences: number;
  /** Most recently seen first. */
  sentences: PatternSentence[];
}

/** A word the learner said in their first language, now in the language being learned. */
export interface NewWordView {
  id: string;
  word: string;
  said: string;
  status: ReviewStatus;
  dueAt: Date | null;
}

/** A mistake saved before patterns existed: listed on its own, with no review. */
export interface EarlierMistakeView {
  id: string;
  category: string;
  original: string;
  correction: string;
  occurrences: number;
}

export interface PracticeView {
  /** By type (in MISTAKE_TYPES order), then mastered last, then the soonest review first. */
  patterns: PatternView[];
  /** Mastered last, then the soonest review first. */
  newWords: NewWordView[];
  earlier: EarlierMistakeView[];
}

const TYPE_ORDER = new Map<string, number>(MISTAKE_TYPES.map((type, i) => [type, i]));

/** The Practice tab: the bank grouped by pattern, with each pattern's and word's review schedule. */
@Injectable()
export class PracticeService {
  constructor(
    @Inject(MISTAKE_BANK_REPOSITORY) private readonly bank: MistakeBankRepository,
    @Inject(REVIEW_REPOSITORY) private readonly reviews: ReviewRepository,
  ) {}

  async view(language: string): Promise<PracticeView> {
    const [entries, schedules] = await Promise.all([this.bank.list(language), this.reviews.schedules(language)]);
    const schedule = new Map(schedules.map((s) => [`${s.subject.kind}:${s.subject.id}`, s]));
    const patterns = new Map<string, PatternView>();
    const newWords: NewWordView[] = [];
    const earlier: EarlierMistakeView[] = [];

    for (const entry of entries) {
      if (entry.category === NEW_WORD_CATEGORY) {
        newWords.push({ id: entry.id, word: entry.correction, said: entry.original, ...scheduled(schedule.get(`new_word:${entry.id}`)) });
      } else if (entry.patternId && entry.pattern) {
        const { patternId, pattern: rule } = entry;
        const pattern = patterns.get(patternId) ?? {
          id: patternId,
          category: entry.category,
          name: rule.name,
          rule: rule.rule,
          ...scheduled(schedule.get(`pattern:${patternId}`)),
          occurrences: 0,
          sentences: [],
        };
        pattern.occurrences += entry.occurrences;
        pattern.sentences.push(sentence(entry));
        patterns.set(patternId, pattern);
      } else {
        const { id, category, original, correction, occurrences } = entry;
        earlier.push({ id, category, original, correction, occurrences });
      }
    }
    return {
      patterns: [...patterns.values()].toSorted((a, b) => typeRank(a) - typeRank(b) || bySchedule(a, b)),
      newWords: newWords.toSorted(bySchedule),
      earlier,
    };
  }
}

function scheduled(s: ReviewSchedule | undefined): { status: ReviewStatus; dueAt: Date | null } {
  return s ? { status: reviewStatus(s.step), dueAt: s.dueAt } : { status: "new", dueAt: null };
}

function sentence({ id, original, correction, occurrences, lastSeenAt }: BankEntry): PatternSentence {
  return { id, original, correction, occurrences, lastSeenAt };
}

const typeRank = (p: PatternView) => TYPE_ORDER.get(p.category) ?? TYPE_ORDER.size;

function bySchedule(a: { status: ReviewStatus; dueAt: Date | null }, b: { status: ReviewStatus; dueAt: Date | null }): number {
  const mastered = Number(a.status === "mastered") - Number(b.status === "mastered");
  return mastered || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity);
}
