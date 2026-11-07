import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { useMediaQuery, WIDE } from "@/hooks/use-media-query";
import type { BankMistake, MistakeStatus } from "@/lib/api";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { categoryLabel, originalProps, seenAgo, STATUS_LABEL } from "./format";
import { MISTAKES_COPY } from "./mistakes-copy";
import { MistakePanel, MistakeSheet } from "./mistake-sheet";

const STATUSES: MistakeStatus[] = ["open", "improving", "mastered"];

/** The mistake bank, one status at a time. */
export function MistakesPage(props: { now?: Date }) {
  const api = useApi();
  const [now] = useState(() => props.now ?? new Date());
  const [mistakes, setMistakes] = useState<BankMistake[] | "loading" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<MistakeStatus>("open");
  const [selected, setSelected] = useState<BankMistake | null>(null);
  const copy = useCopy(MISTAKES_COPY);
  const status_ = useCopy(STATUS_LABEL);
  const { locale } = useLocale();
  const wide = useMediaQuery(WIDE);

  useEffect(() => {
    let active = true;
    api
      .listMistakes()
      .then((list) => active && setMistakes(list))
      .catch(() => active && setMistakes("failed"));
    return () => {
      active = false;
    };
  }, [api, attempt]);

  const heading = <h1 className="m-0 text-title">{copy.title}</h1>;
  if (mistakes === "loading") {
    return (
      <>
        {heading}
        <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
          <span className="sr-only">{copy.loading}</span>
          <div aria-hidden="true" className="vx-skeleton h-12 rounded-pill" />
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden="true" className="vx-skeleton h-[118px] rounded-md" />
          ))}
        </div>
      </>
    );
  }
  if (mistakes === "failed") {
    return (
      <>
        {heading}
        <Card>
          <span className="text-body-strong">{copy.loadFailed}</span>
          <span className="text-caption text-taupe">{copy.loadFailedBody}</span>
          <Button
            variant="secondary"
            onClick={() => {
              setMistakes("loading");
              setAttempt((n) => n + 1);
            }}
          >
            {copy.tryAgain}
          </Button>
        </Card>
      </>
    );
  }
  if (mistakes.length === 0) {
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

  const shown = mistakes.filter((m) => m.status === status);
  // Wide screens show one mistake beside the list: the picked one, else the first.
  const detail = wide ? (shown.find((m) => m.id === selected?.id) ?? shown[0] ?? null) : null;
  const dismissed = (id: string) => {
    setSelected(null);
    setMistakes(mistakes.filter((m) => m.id !== id));
  };
  return (
    <>
      {heading}
      <div role="group" aria-label={copy.statusGroup} className="grid grid-cols-3 gap-1 rounded-pill bg-sand-soft p-1 lg:max-w-[400px]">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={s === status}
            onClick={() => setStatus(s)}
            className="min-h-10 cursor-pointer rounded-pill border-none bg-transparent font-sans text-[13px] font-bold text-taupe transition-[background-color,color,box-shadow] duration-200 hover:text-ink aria-pressed:bg-paper aria-pressed:text-ink aria-pressed:shadow-tab"
          >
            {status_[s]} · {mistakes.filter((m) => m.status === s).length}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-3">
          {shown.length === 0 && (
            <p className="m-0 text-caption text-taupe">{status === "open" ? copy.allCaughtUp : copy.nothingHere}</p>
          )}
          <ul key={status} className="vx-page-in m-0 flex list-none flex-col gap-3 p-0">
            {shown.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setSelected(m)}
                  aria-current={detail?.id === m.id || undefined}
                  className="flex w-full cursor-pointer flex-col gap-2 rounded-md border-none bg-paper p-[18px] text-left font-sans text-ink shadow-card transition-[transform,box-shadow] duration-150 hover:shadow-[0_1px_0_var(--color-sand),0_6px_16px_-10px_rgba(46,37,32,0.25)] motion-safe:active:scale-[0.98] aria-[current]:shadow-[inset_0_0_0_2px_var(--color-ink)]"
                >
                  <span className="flex justify-between gap-2">
                    <span className="text-label text-honey-ink">{categoryLabel(m.category, locale)}</span>
                    <span className="text-xs text-taupe tabular-nums">
                      {m.occurrences}× · {seenAgo(m.lastSeenAt, now, locale)}
                    </span>
                  </span>
                  <span {...originalProps(m.category)}>
                    {m.original}
                  </span>
                  <span lang="en" className="font-serif text-[19px]">
                    {m.correction}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {detail && (
          <div className="sticky top-0">
            <MistakePanel key={detail.id} mistake={detail} onDismissed={dismissed} />
          </div>
        )}
      </div>

      {selected && !wide && <MistakeSheet mistake={selected} onClose={() => setSelected(null)} onDismissed={dismissed} />}
    </>
  );
}
