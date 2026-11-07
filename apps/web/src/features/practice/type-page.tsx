import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { PracticeNewWord, PracticePattern, PracticeView } from "@/lib/api";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { categoryLabel } from "@/features/mistakes/format";
import { EARLIER_TYPE, NEW_WORDS_TYPE, PRACTICE_PATH, patternPath } from "./paths";
import { PRACTICE_COPY } from "./practice-copy";
import { groupItems, type ReviewItemLike, statusCounts } from "./practice-types";
import { StatusBar, StatusDot, When } from "./status-bar";

/**
 * One type of the Practice tab: its items in three groups, Review today, Coming up and Mastered, the last
 * one folded so the list stays short however many patterns the learner has mastered. The new words and the
 * mistakes from before patterns use the same page.
 */
export function TypePage({ type, practice, now }: { type: string; practice: PracticeView; now: Date }) {
  const copy = useCopy(PRACTICE_COPY);
  const { locale } = useLocale();
  // The row that opened this page is gone: start reading from the type's name.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  const title = type === NEW_WORDS_TYPE ? copy.newWordsTitle : type === EARLIER_TYPE ? copy.earlier : categoryLabel(type, locale);
  const back = (
    <div className="flex items-center pt-2">
      <Link
        to={PRACTICE_PATH}
        className="inline-flex size-11 items-center justify-center rounded-full bg-paper text-ink shadow-card"
        aria-label={copy.back}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </Link>
    </div>
  );

  if (type === EARLIER_TYPE) {
    return (
      <>
        {back}
        <h1 ref={heading} tabIndex={-1} className="m-0 font-serif text-[28px] leading-tight font-normal outline-none">
          {title}
        </h1>
        <p className="m-0 text-caption text-taupe">{copy.earlierNote}</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {practice.earlier.map((m) => (
            <li key={m.id} className="flex flex-col gap-1 rounded-md bg-paper px-4 py-3 shadow-card">
              <span lang="en" className="text-small text-taupe line-through">
                {m.original}
              </span>
              <span lang="en" className="text-body">
                {m.correction}
              </span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const items: ReviewItemLike[] = type === NEW_WORDS_TYPE ? practice.newWords : practice.patterns.filter((p) => p.category === type);
  const counts = statusCounts(items);
  const row = (item: ReviewItemLike) =>
    type === NEW_WORDS_TYPE ? <WordRow key={(item as PracticeNewWord).id} word={item as PracticeNewWord} now={now} /> : <PatternRow key={(item as PracticePattern).id} pattern={item as PracticePattern} now={now} />;
  return (
    <>
      {back}
      <div className="flex flex-col gap-2.5">
        <h1 ref={heading} tabIndex={-1} className="m-0 font-serif text-[28px] leading-tight font-normal outline-none">
          {title}
        </h1>
        <StatusBar counts={counts} className="h-1.5 rounded-[3px]" />
        <span className="flex gap-3.5 text-caption text-taupe">
          {(["new", "improving", "mastered"] as const).map((s) => (
            <span key={s}>
              <b className="font-bold text-ink tabular-nums">{counts[s]}</b> {copy.status[s].toLowerCase()}
            </span>
          ))}
        </span>
      </div>
      <Groups items={items} now={now} row={row} />
    </>
  );
}

function Groups<T extends ReviewItemLike>({ items, now, row }: { items: T[]; now: Date; row: (item: T) => ReactNode }) {
  const copy = useCopy(PRACTICE_COPY);
  const groups = groupItems(items, now);
  const [masteredOpen, setMasteredOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {groups.due.length > 0 && <Group title={copy.reviewToday} tone="text-honey-ink" items={groups.due} row={row} />}
      {groups.upcoming.length > 0 && <Group title={copy.comingUp} tone="text-mist-ink" items={groups.upcoming} row={row} />}
      {groups.mastered.length > 0 && (
        <section aria-label={copy.masteredGroup(groups.mastered.length)} className="flex flex-col rounded-lg bg-paper shadow-card">
          <button
            type="button"
            aria-expanded={masteredOpen}
            onClick={() => setMasteredOpen((open) => !open)}
            className="flex min-h-[52px] w-full cursor-pointer items-center justify-between gap-3 border-none bg-transparent px-5 py-3.5 text-left font-sans text-body font-semibold text-ink"
          >
            <span className="flex items-center gap-3">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-sage-strong" />
              {copy.masteredGroup(groups.mastered.length)}
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              className={cn("text-taupe transition-transform duration-200", masteredOpen && "rotate-180")}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {masteredOpen && <ul className="m-0 flex list-none flex-col p-0">{groups.mastered.map(row)}</ul>}
        </section>
      )}
    </div>
  );
}

function Group<T>({ title, tone, items, row }: { title: string; tone: string; items: T[]; row: (item: T) => ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col rounded-lg bg-paper pb-1 shadow-card">
      <h2 className={cn("m-0 flex items-center justify-between px-5 pt-3 pb-1 text-label", tone)}>
        <span>{title}</span>
        <span className="text-caption text-taupe tabular-nums">{items.length}</span>
      </h2>
      <ul className="m-0 flex list-none flex-col p-0">{items.map(row)}</ul>
    </section>
  );
}

const LI = "border-t border-sand-soft first:border-t-0";
const ROW = "flex min-h-[52px] items-center gap-3 px-5 py-3 text-ink no-underline";

function PatternRow({ pattern, now }: { pattern: PracticePattern; now: Date }) {
  return (
    <li className={LI}>
      <Link to={patternPath(pattern.id)} className={cn(ROW, "motion-safe:active:scale-[0.99]")}>
        <StatusDot status={pattern.status} />
        <span className={cn("min-w-0 flex-1 text-body", pattern.status === "mastered" ? "text-ink-soft" : "font-semibold")}>{pattern.name}</span>
        <When status={pattern.status} dueAt={pattern.dueAt} now={now} />
      </Link>
    </li>
  );
}

function WordRow({ word, now }: { word: PracticeNewWord; now: Date }) {
  return (
    <li className={cn(LI, ROW)}>
      <StatusDot status={word.status} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span lang="en" className="font-serif text-[19px]">
          {word.word}
        </span>
        <span lang="pt-BR" className="text-caption text-taupe">
          {word.said}
        </span>
      </span>
      <When status={word.status} dueAt={word.dueAt} now={now} />
    </li>
  );
}
