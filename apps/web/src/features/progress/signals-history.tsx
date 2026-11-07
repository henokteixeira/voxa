import { useEffect, useId, useState } from "react";
import { Card } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import type { SignalsHistoryEntry } from "@/lib/api";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { SIGNALS_COPY, type SignalKey } from "./signals-copy";

/** The signals shown over time, in this order. Self-correction is left out: most sessions have no hint to fix. */
const SHOWN: SignalKey[] = ["unaidedShare", "wordsPerMinute", "longPausesPerMinute", "averagePauseMs", "mistakesPer100Words"];

/** Fewer sessions than this say nothing about a trend: the tab shows the empty state instead. */
const MIN_SESSIONS = 2;

/** The signals of the last practice sessions (undefined while loading, null when they could not be read). */
function useSignalsHistory() {
  const api = useApi();
  const [sessions, setSessions] = useState<SignalsHistoryEntry[] | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    api
      .signalsHistory()
      .then((history) => !cancelled && setSessions(history.sessions))
      .catch(() => !cancelled && setSessions(null));
    return () => {
      cancelled = true;
    };
  }, [api]);
  return sessions;
}

/** The fluency signals over the last sessions: one small line per signal, newest value beside it. */
export function SignalsHistory() {
  const copy = useCopy(SIGNALS_COPY);
  const sessions = useSignalsHistory();
  const titleId = useId();
  if (sessions === undefined) return null;
  if (sessions === null || sessions.length < MIN_SESSIONS) {
    return (
      <Card>
        <span className="text-body-strong">{sessions === null ? copy.unavailableTitle : copy.emptyTitle}</span>
        <span className="text-caption text-taupe">{sessions === null ? copy.unavailableBody : copy.emptyBody}</span>
      </Card>
    );
  }
  return (
    <Card role="region" aria-labelledby={titleId}>
      <h2 id={titleId} className="m-0 text-caption text-taupe">
        {copy.title(sessions.length)}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {SHOWN.map((key) => (
          <SignalRow key={key} name={key} sessions={sessions} />
        ))}
      </ul>
      <p className="m-0 text-caption text-taupe">{copy.note}</p>
    </Card>
  );
}

function SignalRow({ name, sessions }: { name: SignalKey; sessions: SignalsHistoryEntry[] }) {
  const copy = useCopy(SIGNALS_COPY);
  const { locale } = useLocale();
  const signal = copy.signals[name];
  const points = sessions.flatMap((s, index) => (s.signals[name] === null ? [] : [{ index, value: s.signals[name] as number }]));
  const latest = points.at(-1);
  const format = (value: number) => signal.format(value, locale);
  return (
    <li className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-small text-ink">{signal.name}</span>
        <span className="text-caption text-taupe">{signal.better}</span>
      </div>
      {points.length >= MIN_SESSIONS ? (
        <Sparkline
          points={points}
          slots={sessions.length}
          label={copy.trendLabel(signal.name, points.map((p) => format(p.value)))}
          title={(p) => `${new Date(sessions[p.index].recordedAt).toLocaleDateString(locale, { day: "numeric", month: "short" })}: ${format(p.value)}`}
        />
      ) : (
        <span className="w-24 text-right text-caption text-taupe">{points.length ? copy.oneSession : copy.notMeasured}</span>
      )}
      <span className="w-16 text-right font-serif text-[20px] tabular-nums text-ink">{latest ? format(latest.value) : "–"}</span>
    </li>
  );
}

const WIDTH = 96;
const HEIGHT = 32;
const PAD = 4;

/** One series, oldest to newest, scaled to its own range. Each point names its date and value on hover. */
function Sparkline(props: {
  points: { index: number; value: number }[];
  slots: number;
  label: string;
  title: (point: { index: number; value: number }) => string;
}) {
  const { points, slots } = props;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const x = (index: number) => PAD + (index / Math.max(slots - 1, 1)) * (WIDTH - 2 * PAD);
  const y = (value: number) => HEIGHT - PAD - ((value - min) / span) * (HEIGHT - 2 * PAD);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.index).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return (
    <svg role="img" aria-label={props.label} width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="shrink-0 text-sage-ink">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle
          key={p.index}
          cx={x(p.index)}
          cy={y(p.value)}
          r={i === points.length - 1 ? 3.5 : 2}
          fill="currentColor"
          stroke="var(--color-paper)"
          strokeWidth={i === points.length - 1 ? 2 : 0}
        >
          <title>{props.title(p)}</title>
        </circle>
      ))}
    </svg>
  );
}
