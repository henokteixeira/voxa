import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import type { BankMistake, PracticePattern } from "@/lib/api";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { categoryLabel } from "@/features/mistakes/format";
import { MistakeSheet } from "@/features/mistakes/mistake-sheet";
import { reviewDay } from "./format";
import { PRACTICE_COPY } from "./practice-copy";
import { PRACTICE_PATH, reviewPath } from "./paths";

const STATUS_CHIP = {
  new: "bg-honey-soft text-honey-ink",
  improving: "bg-mist text-mist-ink",
  mastered: "bg-sage-soft text-sage-ink",
} as const;

/** One pattern: its rule, how often it came up, its next review and the learner's own sentences. */
export function PatternDetail(props: { pattern: PracticePattern; now: Date; onDismissed: () => void }) {
  const { pattern, now } = props;
  const copy = useCopy(PRACTICE_COPY);
  const { locale } = useLocale();
  // The sentence the learner says isn't a mistake, in the sheet that asks why.
  const [sentence, setSentence] = useState<BankMistake | null>(null);
  // The row that opened this page is gone: start reading from the pattern's name.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const next =
    pattern.status === "mastered" ? copy.status.mastered : pattern.dueAt ? reviewDay(pattern.dueAt, now, locale) : copy.notScheduled;
  return (
    <>
      <div className="flex items-center justify-between pt-2">
        <Link
          to={PRACTICE_PATH}
          className="inline-flex size-11 items-center justify-center rounded-full bg-paper text-ink shadow-card"
          aria-label={copy.back}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <span className={cn("rounded-pill px-2.5 py-1 text-xs font-bold", STATUS_CHIP[pattern.status])}>{copy.status[pattern.status]}</span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-label text-honey-ink">{categoryLabel(pattern.category, locale)}</span>
        <h1 ref={heading} tabIndex={-1} className="m-0 font-serif outline-none text-[28px] leading-tight font-normal">{pattern.name}</h1>
        <p className="m-0 text-body text-ink-soft">{pattern.rule}</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <span className="rounded-md bg-paper px-4 py-3.5 font-serif text-[22px] shadow-card">{copy.times(pattern.occurrences)}</span>
        <span className="flex flex-col gap-1 rounded-md bg-paper px-4 py-3.5 shadow-card">
          <span className="font-serif text-[22px] first-letter:uppercase">{next}</span>
          <span className="text-caption text-taupe">{copy.nextReviewLabel}</span>
        </span>
      </div>
      <section aria-label={copy.yourSentences} className="flex flex-col gap-2">
        <h2 className="m-0 text-label text-taupe">{copy.yourSentences}</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {pattern.sentences.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 rounded-md bg-paper px-4 py-3 shadow-card">
              <span lang="en" className="text-small text-taupe line-through">
                {s.original}
              </span>
              <span lang="en" className="text-body">
                {s.correction}
              </span>
              <button
                type="button"
                onClick={() =>
                  setSentence({ ...s, language: "en", category: pattern.category, status: "open" })
                }
                className="cursor-pointer self-start border-none bg-transparent p-0 text-caption text-taupe underline-offset-4 hover:text-ink hover:underline"
              >
                {copy.notAMistake}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <div className="flex-1" />
      <Button block asChild>
        <Link to={reviewPath({ kind: "pattern", id: pattern.id })}>{copy.practiceThis}</Link>
      </Button>
      {sentence && (
        <MistakeSheet
          askWhy
          mistake={sentence}
          onClose={() => setSentence(null)}
          onDismissed={() => {
            setSentence(null);
            props.onDismissed();
          }}
        />
      )}
    </>
  );
}
