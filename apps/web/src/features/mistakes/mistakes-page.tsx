import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import type { BankMistake, MistakeStatus } from "@/lib/api";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { categoryLabel, originalProps, seenAgo, STATUS_LABEL } from "./format";
import { MISTAKES_COPY } from "./mistakes-copy";
import { MistakeSheet } from "./mistake-sheet";

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
          <div className="vx-skeleton h-12 rounded-pill" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="vx-skeleton h-[118px] rounded-md" />
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
  return (
    <>
      {heading}
      <div role="group" aria-label={copy.statusGroup} className="grid grid-cols-3 gap-1 rounded-pill bg-sand-soft p-1">
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

      {shown.length === 0 && (
        <p className="m-0 text-caption text-taupe">{status === "open" ? copy.allCaughtUp : copy.nothingHere}</p>
      )}
      <ul key={status} className="vx-page-in m-0 flex list-none flex-col gap-3 p-0">
        {shown.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => setSelected(m)}
              className="flex w-full cursor-pointer flex-col gap-2 rounded-md border-none bg-paper p-[18px] text-left font-sans text-ink shadow-card transition-[transform,box-shadow] duration-150 hover:shadow-[0_1px_0_var(--color-sand),0_6px_16px_-10px_rgba(46,37,32,0.25)] active:scale-[0.98]"
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

      {selected && (
        <MistakeSheet
          mistake={selected}
          onClose={() => setSelected(null)}
          onDismissed={(id) => {
            setSelected(null);
            setMistakes(mistakes.filter((m) => m.id !== id));
          }}
        />
      )}
    </>
  );
}
