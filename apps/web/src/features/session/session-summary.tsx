import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { VoiceBall } from "@/components/voice-ball";
import {
  type FluencySignals,
  type Mode,
  NEW_WORD_CATEGORY,
  type SessionMistake,
  type SessionSummary,
  type SignalComparison,
  type Takeaway,
} from "@/lib/api";
import { Sheet } from "@/components/ui/sheet";
import { categoryLabel } from "@/features/mistakes/format";
import { comesBack } from "@/features/practice/format";
import { type ReviewResult, ReviewRun } from "@/features/practice/review-run";
import { SessionXpCard } from "@/features/xp/session-xp";
import { MISSION_PATH, saveMissionTakeaways } from "@/features/mission/mission-steps";
import { GoalsSummary } from "./goals";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { useModeInfo } from "./modes";
import { REFLECTION_COPY } from "./reflection-copy";
import { LEVEL_PATH } from "@/features/progress/level-card";

type Step = "result" | "takeaways" | "review" | "reviewed" | "saved";

/**
 * After "End session": the result with the fluency signals and how they compare with the last sessions,
 * up to three patterns to take away (with the rest one tap away), an optional quick try of them, then where
 * they were saved. Without a summary (the end failed), only "Session saved".
 * As step 3 of the daily mission (`missionId`), the takeaways show once with no try, and the mission goes on:
 * step 5 reviews them.
 */
export function SummaryFlow(props: { mode: Mode; elapsed: string; summary: SessionSummary | null; missionId?: string | null }) {
  const { summary, mode, missionId } = props;
  const modes = useModeInfo();
  const copy = useCopy(REFLECTION_COPY);
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(summary ? "result" : "saved");
  const [reviewed, setReviewed] = useState<ReviewResult[]>([]);
  useEffect(() => {
    if (missionId && summary?.takeaways?.length) saveMissionTakeaways(missionId, summary.takeaways.map((t) => t.patternId));
  }, [missionId, summary]);
  const toMission = () => navigate(MISSION_PATH, { replace: true });

  const { mistakes } = summary ?? { mistakes: [] };
  const takeaways = summary?.takeaways ?? [];
  const realMistakes = mistakes.filter((m) => !isNewWord(m));
  // The placement interview never talks about mistakes.
  const savedMistakes = summary && mode !== "placement" ? realMistakes.length : null;
  if (!summary || step === "saved") return <Saved mistakes={savedMistakes} inMission={Boolean(missionId)} />;

  const afterResult = () => (mistakes.length ? setStep("takeaways") : missionId ? toMission() : setStep("saved"));

  // The placement interview ends with thanks, not with a level or mistakes: the level lives in Progress.
  if (mode === "placement") return <PlacementResult summary={summary} />;

  if (step === "result") {
    return (
      <>
        <div className="flex flex-col gap-1 pt-2">
          <span className="text-label text-taupe">
            {modes[mode].title} · {props.elapsed}
          </span>
          <h1 className="m-0 text-title">{copy.sessionDone}</h1>
        </div>
        {summary.xp && <SessionXpCard xp={summary.xp} />}
        {summary.comparison && <Comparison comparison={summary.comparison} />}
        <Signals signals={summary.signals} mistakes={mistakes} />
        <GoalsSummary summary={summary} />
        <div className="flex-1" />
        <Button block onClick={afterResult}>
          {mistakes.length ? copy.seeMistakes : missionId ? copy.continueMission : copy.continue}
        </Button>
      </>
    );
  }

  if (step === "takeaways") {
    return (
      <Takeaways
        heading={`${modes[mode].title} · ${props.elapsed}`}
        takeaways={takeaways}
        mistakes={mistakes}
        onTry={missionId ? undefined : () => setStep("review")}
        onLater={missionId ? toMission : () => setStep("saved")}
        laterLabel={missionId ? copy.continueMission : undefined}
      />
    );
  }

  if (step === "review") {
    return (
      <ReviewRun
        subjects={takeaways.map((t) => ({ kind: "pattern", id: t.patternId }))}
        onDone={(results) => {
          setReviewed(results);
          setStep(results.length ? "reviewed" : "saved");
        }}
      />
    );
  }

  return <ReviewSaved results={reviewed} />;
}

/** A word the learner said in their first language: something learned, never a mistake. */
const isNewWord = (mistake: SessionMistake) => mistake.category === NEW_WORD_CATEGORY;

/**
 * Up to three patterns, with the words the learner said but not the correct form: they try it first.
 * New words get their own card; every other mistake is one line in "small details", grouped by pattern.
 */
function Takeaways(props: {
  heading: string;
  takeaways: Takeaway[];
  mistakes: SessionMistake[];
  /** Without it (in the mission) there is no try here: step 5 reviews them. */
  onTry?: () => void;
  onLater: () => void;
  laterLabel?: string;
}) {
  const { takeaways, mistakes } = props;
  const copy = useCopy(REFLECTION_COPY);
  const { locale } = useLocale();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const newWords = mistakes.filter(isNewWord);
  const details = smallDetails(mistakes, new Set(takeaways.map((t) => t.patternId)));
  return (
    <>
      <div className="flex flex-col gap-1 pt-2">
        <span className="text-label text-taupe">{props.heading}</span>
        <h1 className="m-0 text-title">{copy.takeThese}</h1>
      </div>
      <ul aria-label={copy.takeaways} className="m-0 flex list-none flex-col gap-3 p-0">
        {takeaways.map((t) => (
          <li key={t.patternId} className="flex flex-col gap-1.5 rounded-md bg-paper px-4 py-3.5 shadow-card">
            <span className="self-start rounded-pill bg-honey-soft px-2.5 py-1 text-[12px] font-bold text-honey-ink">
              {categoryLabel(t.category, locale)}
            </span>
            <span className="font-serif text-[19px] leading-snug">{t.name}</span>
            <span lang="en" className="text-small text-taupe">
              {copy.youSaid(t.said)}
            </span>
          </li>
        ))}
      </ul>
      {newWords.length > 0 && (
        <section aria-label={copy.newWords} className="flex flex-col gap-2 rounded-md bg-sage-soft px-4 py-3.5">
          <span className="text-caption font-bold text-sage-ink">{copy.newWords}</span>
          {newWords.map((w) => (
            <span key={w.original} className="text-small">
              <span lang="pt-BR" className="text-taupe">
                {w.original}
              </span>{" "}
              → <span lang="en">{w.correction}</span>
            </span>
          ))}
        </section>
      )}
      {details.length > 0 && (
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="cursor-pointer self-start border-none bg-transparent p-0 text-small font-bold text-taupe underline-offset-4 hover:text-ink hover:underline"
        >
          {copy.smallDetails(details.reduce((n, d) => n + d.count, 0))}
        </button>
      )}
      <div className="flex-1" />
      <div className="flex flex-col gap-2">
        {takeaways.length > 0 && props.onTry ? (
          <>
            <Button block onClick={props.onTry}>
              {copy.tryThem}
            </Button>
            <Button variant="ghost" block onClick={props.onLater}>
              {copy.later}
            </Button>
          </>
        ) : (
          <Button block onClick={props.onLater}>
            {props.laterLabel ?? copy.continue}
          </Button>
        )}
      </div>
      {detailsOpen && (
        <Sheet label={copy.smallDetailsTitle} onClose={() => setDetailsOpen(false)}>
          {(close) => (
            <>
              <h2 className="m-0 font-serif text-2xl font-normal">{copy.smallDetailsTitle}</h2>
              <p className="m-0 text-caption text-taupe">{copy.smallDetailsNote}</p>
              <ul className="m-0 flex list-none flex-col gap-2.5 rounded-md bg-paper p-4 shadow-card">
                {details.map((d) => (
                  <li key={d.key} className="flex justify-between gap-3 text-small">
                    <span>
                      <b>{categoryLabel(d.category, locale)}</b> · <span lang="en">{d.label}</span>
                    </span>
                    <span className="text-caption text-taupe tabular-nums">{d.count}</span>
                  </li>
                ))}
              </ul>
              <Button variant="secondary" block onClick={close}>
                {copy.close}
              </Button>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}

interface SmallDetail {
  key: string;
  category: string;
  /** The pattern's name, or the correct form for a mistake without one. */
  label: string;
  count: number;
}

/** The session's mistakes that are not taken away, one line per pattern with how many times it came up. */
function smallDetails(mistakes: SessionMistake[], takenAway: Set<string>): SmallDetail[] {
  const groups = new Map<string, SmallDetail>();
  for (const m of mistakes) {
    if (isNewWord(m) || (m.patternId && takenAway.has(m.patternId))) continue;
    const key = m.patternId ?? `mistake:${m.original}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { key, category: m.category, label: m.pattern?.name ?? m.correction, count: 1 });
  }
  return [...groups.values()];
}

/** After trying the patterns: when each one comes back. */
function ReviewSaved({ results }: { results: ReviewResult[] }) {
  const copy = useCopy(REFLECTION_COPY);
  const { locale } = useLocale();
  const [now] = useState(() => new Date());
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <VoiceBall state="success" size={140} />
        <h1 className="m-0 text-title">{copy.reviewSaved}</h1>
        {results.length > 0 && (
          <p className="m-0 text-small font-medium text-sage-ink">{copy.reviewXp(results.reduce((sum, r) => sum + r.xp, 0))}</p>
        )}
        <ul className="m-0 flex w-full list-none flex-col gap-2.5 rounded-md bg-paper p-4 text-left shadow-card">
          {results.map((r) => (
            <li key={r.subject.id} className="flex justify-between gap-3 text-small">
              <span>{r.name}</span>
              <span className="text-caption text-taupe">{comesBack(r.nextDueAt, now, locale)}</span>
            </li>
          ))}
        </ul>
        <p className="m-0 text-caption text-taupe">{copy.reviewSavedNote}</p>
      </div>
      <Button block asChild>
        <Link to="/">{copy.done}</Link>
      </Button>
    </>
  );
}

/**
 * Inferred confidence: one line on what went better than in the last sessions. Signals that went worse are
 * not listed: the summary never reads as a grade, and one session is too little to call a drop.
 */
function Comparison({ comparison }: { comparison: SignalComparison }) {
  const copy = useCopy(REFLECTION_COPY).comparison;
  const better = comparison.signals.filter((s) => s.trend === "better").map((s) => copy.better[s.name]);
  return (
    <section aria-label={copy.label} className="flex flex-col gap-1 rounded-md bg-sage-soft px-4 py-3.5">
      <span className="text-caption text-sage-ink">{copy.comparedWith(comparison.sessions)}</span>
      <p className="m-0 text-small text-ink">{better.length ? copy.list(better) : copy.steady(comparison.sessions)}</p>
    </section>
  );
}

function Signals({ signals, mistakes }: { signals: FluencySignals; mistakes: SessionMistake[] }) {
  const copy = useCopy(REFLECTION_COPY);
  const { locale } = useLocale();
  const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const t = copy.signals;
  const hinted = mistakes.filter((m) => m.severity === "serious");
  const tiles = [
    {
      name: t.pace,
      value: signals.wordsPerMinute === null ? null : String(signals.wordsPerMinute),
      note: t.perMinute(signals.longPausesPerMinute === null ? null : decimal.format(signals.longPausesPerMinute)),
      empty: t.notMeasured,
    },
    {
      name: t.fixedYourself,
      value: hinted.length ? t.ofTotal(hinted.filter((m) => m.selfCorrected).length, hinted.length) : null,
      note: t.afterHint,
      empty: t.noHints,
    },
    {
      name: t.pause,
      value: signals.averagePauseMs === null ? null : `${decimal.format(signals.averagePauseMs / 1000)} s`,
      note: t.average,
      empty: t.notMeasured,
    },
    {
      name: t.mistakes,
      value: signals.mistakesPer100Words === null ? null : decimal.format(signals.mistakesPer100Words),
      note: t.per100,
      empty: t.noWords,
    },
    {
      name: t.answerLength,
      value: signals.wordsPerAnswer == null ? null : decimal.format(signals.wordsPerAnswer),
      note: t.answerLengthNote,
      empty: t.noWords,
      wide: true,
    },
  ];
  return (
    <dl aria-label={copy.signalsLabel} className="m-0 grid grid-cols-2 gap-2.5">
      {tiles.map((tile) => (
        <div
          key={tile.name}
          className={`flex flex-col gap-1 rounded-md bg-paper px-4 py-3.5 shadow-card${"wide" in tile && tile.wide ? " col-span-2" : ""}`}
        >
          <dt className="text-caption text-taupe">{tile.name}</dt>
          <dd className="m-0 font-serif text-[26px] tabular-nums">{tile.value ?? "–"}</dd>
          <dd className="m-0 text-caption text-taupe">{tile.value === null ? tile.empty : tile.note}</dd>
        </div>
      ))}
    </dl>
  );
}

/** After the level chat: no result here (the level lives in Progress), then on to Today. */
function PlacementResult({ summary }: { summary: SessionSummary }) {
  const copy = useCopy(REFLECTION_COPY);
  const placed = Boolean(summary.level);
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-7 text-center">
        <VoiceBall state="success" size={160} />
        <div className="flex flex-col gap-3">
          <h1 className="m-0 text-title">{copy.placementDone}</h1>
          <p className="m-0 text-body text-ink-soft">{placed ? copy.placementWhere : copy.placementNoLevel}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button block asChild>
          <Link to="/">{copy.firstSession}</Link>
        </Button>
        {placed && (
          <Button variant="ghost" block asChild>
            <Link to={LEVEL_PATH}>{copy.seeInProgress}</Link>
          </Button>
        )}
      </div>
    </>
  );
}

function Saved({ mistakes, inMission }: { mistakes: number | null; inMission: boolean }) {
  const copy = useCopy(REFLECTION_COPY);
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <VoiceBall state="success" size={160} />
        <h1 className="m-0 text-title">{copy.saved}</h1>
        <p className="m-0 text-caption text-taupe">{mistakes ? copy.savedToBank(mistakes) : copy.savedSession}</p>
        {mistakes ? <p className="m-0 text-body text-ink-soft">{copy.savedEncouragement}</p> : null}
      </div>
      <Button block asChild>
        {inMission ? <Link to={MISSION_PATH}>{copy.continueMission}</Link> : <Link to="/">{copy.backToToday}</Link>}
      </Button>
    </>
  );
}
