import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import type { PracticePattern, PracticeView, ReviewOverview, ReviewStatus } from "@/lib/api";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { categoryLabel } from "@/features/mistakes/format";
import { reviewDay } from "./format";
import { PatternDetail } from "./pattern-detail";
import { PRACTICE_COPY } from "./practice-copy";
import { patternPath, REVIEW_PATH } from "./paths";

/** Status dots: honey new, mist improving, sage mastered. */
const STATUS_DOT: Record<ReviewStatus, string> = {
  new: "bg-honey",
  improving: "bg-mist",
  mastered: "bg-sage-strong",
};

type Loaded = { practice: PracticeView; reviews: ReviewOverview };

/**
 * The Practice tab: a review card when something is due, then the bank as patterns grouped by type (or the
 * new words), each with when it comes back. A pattern opens its rule and the learner's own sentences.
 */
export function PracticePage(props: { now?: Date }) {
  const api = useApi();
  const copy = useCopy(PRACTICE_COPY);
  const [now] = useState(() => props.now ?? new Date());
  const [data, setData] = useState<Loaded | "loading" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [segment, setSegment] = useState<"patterns" | "words">("patterns");
  // A pattern's page has its own address, so Back returns to the list.
  const open = useParams().patternId ?? null;
  const navigate = useNavigate();

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
  const pattern = practice.patterns.find((p) => p.id === open);
  if (pattern) {
    return (
      <PatternDetail
        pattern={pattern}
        now={now}
        onDismissed={() => setAttempt((n) => n + 1)}
      />
    );
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

  return (
    <>
      {heading}
      <ReviewCard reviews={reviews} now={now} />
      <div role="group" aria-label={copy.view} className="grid grid-cols-2 gap-1 rounded-pill bg-sand-soft p-1 lg:max-w-[400px]">
        {(["patterns", "words"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={s === segment}
            onClick={() => setSegment(s)}
            className="min-h-10 cursor-pointer rounded-pill border-none bg-transparent font-sans text-[13px] font-bold text-taupe transition-[background-color,color,box-shadow] duration-200 hover:text-ink aria-pressed:bg-paper aria-pressed:text-ink aria-pressed:shadow-tab"
          >
            {s === "patterns" ? copy.patterns(practice.patterns.length) : copy.newWords(practice.newWords.length)}
          </button>
        ))}
      </div>
      {segment === "patterns" ? (
        <Patterns practice={practice} now={now} onOpen={(id) => navigate(patternPath(id))} />
      ) : (
        <ul aria-label={copy.newWords(practice.newWords.length)} className="m-0 flex list-none flex-col gap-2.5 p-0">
          {practice.newWords.map((w) => (
            <li key={w.id} className="flex items-center gap-3 rounded-md bg-paper px-4 py-3.5 shadow-card">
              <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", STATUS_DOT[w.status])} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span lang="en" className="font-serif text-[19px]">
                  {w.word}
                </span>
                <span lang="pt-BR" className="text-caption text-taupe">
                  {w.said}
                </span>
              </span>
              <When status={w.status} dueAt={w.dueAt} now={now} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
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

function Patterns({ practice, now, onOpen }: { practice: PracticeView; now: Date; onOpen: (id: string) => void }) {
  const copy = useCopy(PRACTICE_COPY);
  const { locale } = useLocale();
  // The API sends them by type already: keep that order.
  const groups = new Map<string, PracticePattern[]>();
  for (const p of practice.patterns) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
  return (
    <div className="flex flex-col gap-5">
      {[...groups].map(([category, patterns]) => (
        <section key={category} aria-label={categoryLabel(category, locale)} className="flex flex-col gap-2">
          <h2 className="m-0 flex justify-between text-label text-taupe">
            <span>{categoryLabel(category, locale)}</span>
            <span className="tabular-nums">{patterns.length}</span>
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {patterns.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-md border-none bg-paper px-4 py-3.5 text-left font-sans text-ink shadow-card motion-safe:active:scale-[0.98]"
                >
                  <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", STATUS_DOT[p.status])} />
                  <span className="min-w-0 flex-1 text-body">{p.name}</span>
                  <When status={p.status} dueAt={p.dueAt} now={now} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {practice.earlier.length > 0 && (
        <section aria-label={copy.earlier} className="flex flex-col gap-2">
          <h2 className="m-0 text-label text-taupe">{copy.earlier}</h2>
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
        </section>
      )}
    </div>
  );
}

/** "Review today", "Review Tue", "Mastered": the status a learner can act on, with the status for screen readers. */
export function When({ status, dueAt, now }: { status: ReviewStatus; dueAt: string | null; now: Date }) {
  const copy = useCopy(PRACTICE_COPY);
  const { locale } = useLocale();
  const text = status === "mastered" ? copy.status.mastered : dueAt ? copy.reviewOn(reviewDay(dueAt, now, locale)) : copy.notScheduled;
  return (
    <span className="shrink-0 text-caption text-taupe">
      {status !== "mastered" && <span className="sr-only">{copy.status[status]} · </span>}
      {text}
    </span>
  );
}
