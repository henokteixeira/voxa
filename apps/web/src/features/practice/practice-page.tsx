import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import type { PracticeView, ReviewOverview } from "@/lib/api";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { categoryLabel } from "@/features/mistakes/format";
import { reviewDay } from "./format";
import { PatternDetail } from "./pattern-detail";
import { EARLIER_TYPE, NEW_WORDS_TYPE, REVIEW_PATH, typePath } from "./paths";
import { PRACTICE_COPY } from "./practice-copy";
import { type PracticeType, practiceTypes } from "./practice-types";
import { StatusBar } from "./status-bar";
import { TypePage } from "./type-page";

type Loaded = { practice: PracticeView; reviews: ReviewOverview };

const CHEVRON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-taupe">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

/**
 * The Practice tab: a review card when something is due, then one row per mistake type (plus the new words)
 * with how it is going. The first screen never grows past the types; a type opens its patterns in groups,
 * and a pattern opens its rule and the learner's own sentences.
 */
export function PracticePage(props: { now?: Date }) {
  const api = useApi();
  const copy = useCopy(PRACTICE_COPY);
  const [now] = useState(() => props.now ?? new Date());
  const [data, setData] = useState<Loaded | "loading" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  // A type's and a pattern's pages have their own addresses, so Back returns one level up.
  const { typeId = null, patternId = null } = useParams();

  useEffect(() => {
    let active = true;
    Promise.all([api.practice(), api.reviewOverview()])
      .then(([practice, reviews]) => active && setData({ practice, reviews }))
      .catch(() => active && setData("failed"));
    return () => {
      active = false;
    };
  }, [api, attempt]);

  const heading = <h1 className="m-0 text-title">{copy.title}</h1>;
  if (data === "loading") {
    return (
      <>
        {heading}
        <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
          <span className="sr-only">{copy.loading}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden="true" className="vx-skeleton h-[96px] rounded-md" />
          ))}
        </div>
      </>
    );
  }
  if (data === "failed") {
    return (
      <>
        {heading}
        <Card>
          <span className="text-body">{copy.loadFailed}</span>
          <Button
            variant="secondary"
            onClick={() => {
              setData("loading");
              setAttempt((n) => n + 1);
            }}
          >
            {copy.tryAgain}
          </Button>
        </Card>
      </>
    );
  }

  const { practice, reviews } = data;
  const pattern = practice.patterns.find((p) => p.id === patternId);
  if (pattern) {
    return <PatternDetail pattern={pattern} now={now} onDismissed={() => setAttempt((n) => n + 1)} />;
  }
  if (typeId) {
    return <TypePage type={typeId} practice={practice} now={now} />;
  }
  if (practice.patterns.length + practice.newWords.length + practice.earlier.length === 0) {
    return (
      <>
        {heading}
        <Card>
          <span className="text-body-strong">{copy.emptyTitle}</span>
          <span className="text-caption text-taupe">{copy.emptyBody}</span>
        </Card>
      </>
    );
  }

  const types = practiceTypes(practice, now);
  return (
    <>
      {heading}
      <ReviewCard reviews={reviews} now={now} />
      {types.length > 0 && (
        <section aria-label={copy.byType} className="flex flex-col gap-2">
          <h2 className="m-0 flex items-baseline justify-between gap-3 text-label text-taupe">
            <span>{copy.byType}</span>
            <Legend />
          </h2>
          <ul className="m-0 flex list-none flex-col rounded-lg bg-paper p-0 shadow-card">
            {types.map((t) => (
              <TypeRow key={t.id} type={t} now={now} />
            ))}
          </ul>
        </section>
      )}
      {practice.earlier.length > 0 && (
        <Link
          to={typePath(EARLIER_TYPE)}
          className="flex min-h-12 items-center gap-3 rounded-lg bg-paper px-5 py-3 text-ink no-underline shadow-card"
        >
          <span className="flex flex-1 items-baseline gap-2 text-[14px] font-medium text-taupe">
            {copy.earlier}
            <span className="text-caption tabular-nums">{practice.earlier.length}</span>
          </span>
          {CHEVRON}
        </Link>
      )}
    </>
  );
}

/** What the bar's colors mean, once, above the list. */
function Legend() {
  const copy = useCopy(PRACTICE_COPY);
  return (
    <span aria-label={copy.statusLegend} className="flex gap-2.5 text-[11px] font-medium tracking-normal normal-case">
      {(["new", "improving", "mastered"] as const).map((s) => (
        <span key={s} className="flex items-center gap-1">
          <span aria-hidden="true" className={`size-2 rounded-full ${s === "new" ? "bg-honey" : s === "improving" ? "bg-mist" : "bg-sage-strong"}`} />
          {copy.status[s].toLowerCase()}
        </span>
      ))}
    </span>
  );
}

/** One type: its name, how many items it has, their status as a bar, and what is next for it. */
function TypeRow({ type, now }: { type: PracticeType; now: Date }) {
  const copy = useCopy(PRACTICE_COPY);
  const { locale } = useLocale();
  const label = type.id === NEW_WORDS_TYPE ? copy.newWordsTitle : categoryLabel(type.id, locale);
  const count = type.id === NEW_WORDS_TYPE ? copy.wordCount(type.count) : copy.patternCount(type.count);
  return (
    <li className="border-t border-sand-soft first:border-t-0">
      <Link
        to={typePath(type.id)}
        className="flex min-h-[58px] items-center gap-3.5 py-3 pr-4 pl-5 text-ink no-underline motion-safe:active:scale-[0.99]"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="flex items-baseline gap-2 text-body font-semibold">
            {label}
            <span className="text-caption font-semibold text-taupe tabular-nums">
              <span className="sr-only">{count}</span>
              <span aria-hidden="true">{type.count}</span>
            </span>
          </span>
          <StatusBar counts={type.counts} />
        </span>
        <Next type={type} now={now} />
        {CHEVRON}
      </Link>
    </li>
  );
}

/** "2 today" in honey, the next review's day, or "Mastered" when the whole type is. */
function Next({ type, now }: { type: PracticeType; now: Date }) {
  const copy = useCopy(PRACTICE_COPY);
  const { locale } = useLocale();
  if (type.due > 0) return <span className="shrink-0 text-caption font-bold text-honey-ink">{copy.dueCount(type.due)}</span>;
  if (type.nextDueAt) return <span className="shrink-0 text-caption text-taupe">{reviewDay(type.nextDueAt, now, locale)}</span>;
  if (type.counts.mastered === type.count) return <span className="shrink-0 text-caption text-sage-ink">{copy.status.mastered}</span>;
  return <span className="shrink-0 text-caption text-taupe">{copy.notScheduled}</span>;
}

/** Due items: a card to start the voice review. Nothing due: when the next review is. */
function ReviewCard({ reviews, now }: { reviews: ReviewOverview; now: Date }) {
  const copy = useCopy(PRACTICE_COPY);
  const { locale } = useLocale();
  if (reviews.due.length > 0) {
    return (
      <section aria-label={copy.dueTitle(reviews.due.length)} className="flex flex-col gap-3 rounded-md bg-ink px-5 py-4 text-paper">
        <span className="flex flex-col gap-0.5">
          <span className="text-body-strong">{copy.dueTitle(reviews.due.length)}</span>
          <span className="text-caption opacity-80">{copy.dueNote}</span>
        </span>
        <Button variant="secondary" asChild>
          <Link to={REVIEW_PATH}>{copy.startReview}</Link>
        </Button>
      </section>
    );
  }
  const next = reviews.nextDueAt;
  return (
    <section aria-label={copy.nothingDue} className="flex flex-col gap-1 rounded-md bg-sage-soft px-5 py-4">
      <span className="text-body-strong">{copy.nothingDue}</span>
      <span className="text-caption text-sage-ink">
        {next ? copy.nextReview(reviewDay(next, now, locale)) : copy.nothingScheduled}
      </span>
      <span className="text-caption text-taupe">{copy.stillPractice}</span>
    </section>
  );
}
