import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import type { BankMistake, MistakeStatus } from "@/lib/api";
import { categoryLabel, seenAgo, STATUS_LABEL } from "./format";
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

  const heading = <h1 className="m-0 text-title">Mistakes</h1>;
  if (mistakes === "loading") return heading;
  if (mistakes === "failed") {
    return (
      <>
        {heading}
        <Card>
          <span className="text-body-strong">Can't load your mistakes</span>
          <span className="text-caption text-taupe">Check that Voxa's server is running on your PC.</span>
          <Button
            variant="secondary"
            onClick={() => {
              setMistakes("loading");
              setAttempt((n) => n + 1);
            }}
          >
            Try again
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
          <span className="text-body-strong">No mistakes yet</span>
          <span className="text-caption text-taupe">
            After your first session, the mistakes worth practicing show up here.
          </span>
        </Card>
      </>
    );
  }

  const shown = mistakes.filter((m) => m.status === status);
  return (
    <>
      {heading}
      <div role="group" aria-label="Status" className="grid grid-cols-3 gap-1 rounded-pill bg-sand-soft p-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={s === status}
            onClick={() => setStatus(s)}
            className="min-h-10 cursor-pointer rounded-pill border-none bg-transparent font-sans text-[13px] font-bold text-taupe aria-pressed:bg-paper aria-pressed:text-ink aria-pressed:shadow-tab"
          >
            {STATUS_LABEL[s]} · {mistakes.filter((m) => m.status === s).length}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="m-0 text-caption text-taupe">Nothing here yet.</p>}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {shown.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => setSelected(m)}
              className="flex w-full cursor-pointer flex-col gap-2 rounded-md border-none bg-paper p-[18px] text-left font-sans text-ink shadow-card"
            >
              <span className="flex justify-between gap-2">
                <span className="text-label text-honey-ink">{categoryLabel(m.category)}</span>
                <span className="text-xs text-taupe tabular-nums">
                  {m.occurrences}× · {seenAgo(m.lastSeenAt, now)}
                </span>
              </span>
              <span className="text-[15px] text-taupe line-through">{m.original}</span>
              <span className="font-serif text-[19px]">{m.correction}</span>
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
