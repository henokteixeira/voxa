import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { VoiceBall } from "@/components/voice-ball";
import { type FluencySignals, type Mode, NEW_WORD_CATEGORY, type SessionMistake, type SessionSummary } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ConfidenceScale } from "./confidence-scale";
import { GoalsSummary } from "./goals";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { useModeInfo } from "./modes";
import { REFLECTION_COPY } from "./reflection-copy";
import { LEVEL_COPY } from "@/features/progress/level-copy";

type Step = "result" | "mistakes" | "confidence" | "saved";

/**
 * After "End session": the result with the 4 fluency signals, the session's mistakes,
 * the confidence check-out, then "Session saved". Without a summary (the end failed), only the last step.
 */
export function SummaryFlow(props: {
  mode: Mode;
  elapsed: string;
  summary: SessionSummary | null;
  onRate: (value: number) => void;
}) {
  const { summary, mode } = props;
  const modes = useModeInfo();
  const copy = useCopy(REFLECTION_COPY);
  const [step, setStep] = useState<Step>(summary ? "result" : "saved");
  const [after, setAfter] = useState<number | null>(null);

  const { mistakes } = summary ?? { mistakes: [] };
  const realMistakes = mistakes.filter((m) => !isNewWord(m));
  // The placement interview never talks about mistakes, not even on the last screen.
  const savedMistakes = summary && mode !== "placement" ? realMistakes.length : null;
  if (!summary || step === "saved") return <Saved mistakes={savedMistakes} />;

  // The placement interview ends with the level, not with mistakes or a confidence question.
  if (mode === "placement") return <PlacementResult summary={summary} onDone={() => setStep("saved")} />;

  if (step === "result") {
    return (
      <>
        <div className="flex flex-col gap-1 pt-2">
          <span className="text-label text-taupe">
            {modes[mode].title} · {props.elapsed}
          </span>
          <h1 className="m-0 text-title">{copy.sessionDone}</h1>
        </div>
        <Signals signals={summary.signals} mistakes={mistakes} />
        <GoalsSummary summary={summary} />
        <div className="flex-1" />
        <Button block onClick={() => setStep(mistakes.length ? "mistakes" : "confidence")}>
          {mistakes.length ? copy.seeMistakes : copy.continue}
        </Button>
      </>
    );
  }

  if (step === "mistakes") {
    const fixed = realMistakes.filter((m) => m.selfCorrected).length;
    return (
      <>
        <div className="flex flex-col gap-1 pt-2">
          <span className="text-label text-honey-ink">
            {copy.mistakesLine(realMistakes.length, fixed, mistakes.length - realMistakes.length)}
          </span>
          <h1 className="m-0 text-title">{copy.whatToKeep}</h1>
        </div>
        <ul aria-label={copy.sessionMistakes} className="m-0 flex flex-1 list-none flex-col gap-3 overflow-y-auto p-0">
          {mistakes.map((m, i) => (
            <li key={i}>
              <MistakeRow mistake={m} />
            </li>
          ))}
        </ul>
        <Button block onClick={() => setStep("confidence")}>
          {copy.continue}
        </Button>
      </>
    );
  }

  const before = summary.confidence.before;
  const label = copy.checkOutQuestion(modes[mode].meeting);
  return (
    <>
      <div className="flex flex-1 flex-col justify-center gap-6">
        <h1 className="m-0 text-title">{label}</h1>
        <ConfidenceScale label={copy.confidenceLabel} low={copy.notAtAll} high={copy.fully} value={after} onChange={setAfter} before={before} />
        {before !== null && <p className="m-0 text-caption text-taupe">{copy.outlined(before)}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Button
          block
          disabled={after === null}
          onClick={() => {
            if (after !== null) props.onRate(after);
            setStep("saved");
          }}
        >
          {copy.continue}
        </Button>
        <Button variant="ghost" block onClick={() => setStep("saved")}>
          {copy.skip}
        </Button>
      </div>
    </>
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
  ];
  return (
    <dl aria-label={copy.signalsLabel} className="m-0 grid grid-cols-2 gap-2.5">
      {tiles.map((tile) => (
        <div key={tile.name} className="flex flex-col gap-1 rounded-md bg-paper px-4 py-3.5 shadow-card">
          <dt className="text-caption text-taupe">{tile.name}</dt>
          <dd className="m-0 font-serif text-[26px] tabular-nums">{tile.value ?? "–"}</dd>
          <dd className="m-0 text-caption text-taupe">{tile.value === null ? tile.empty : tile.note}</dd>
        </div>
      ))}
    </dl>
  );
}

const RESOLUTION_CLASS = {
  fixed: "bg-sage-soft text-sage-ink",
  answer: "bg-honey-soft text-honey-ink",
  small: "bg-sand-soft text-taupe",
  newWord: "bg-sage-soft text-sage-ink",
};

/** A word the learner said in their first language: something learned, never a mistake. */
const isNewWord = (mistake: SessionMistake) => mistake.category === NEW_WORD_CATEGORY;

function MistakeRow({ mistake }: { mistake: SessionMistake }) {
  const copy = useCopy(REFLECTION_COPY);
  const newWord = isNewWord(mistake);
  const resolution = newWord
    ? "newWord"
    : mistake.severity === "minor"
      ? "small"
      : mistake.selfCorrected
        ? "fixed"
        : "answer";
  return (
    <div className="flex flex-col gap-2">
      <span className={cn("self-start rounded-pill px-2.5 py-1 text-[12px] font-bold", RESOLUTION_CLASS[resolution])}>
        {copy.resolution[resolution]}
      </span>
      <div className="flex flex-col gap-1.5 rounded-md bg-paper px-4 py-3.5 shadow-card">
        <span className="flex justify-between gap-3 text-caption text-taupe">
          {newWord ? (
            <span />
          ) : (
            <span lang="en" className="capitalize">
              {mistake.category}
            </span>
          )}
          <span>{mistake.occurrences > 1 ? copy.seen(mistake.occurrences) : copy.isNew}</span>
        </span>
        {newWord ? (
          <span lang="pt-BR" className="text-small text-taupe">
            {mistake.original}
          </span>
        ) : (
          <span lang="en" className="text-small text-taupe line-through">
            {mistake.original}
          </span>
        )}
        <span lang="en" className="text-phrase">
          {mistake.correction}
        </span>
      </div>
    </div>
  );
}

function PlacementResult({ summary, onDone }: { summary: SessionSummary; onDone: () => void }) {
  const copy = useCopy(REFLECTION_COPY);
  const levelCopy = useCopy(LEVEL_COPY);
  const level = summary.level ?? null;
  return (
    <>
      <div className="flex flex-col gap-1 pt-2">
        <h1 className="m-0 text-title">{copy.placementDone}</h1>
      </div>
      {level ? (
        <div className="flex flex-col gap-3 rounded-lg bg-paper p-5 shadow-card">
          <span className="text-caption text-taupe">{levelCopy.estimate}</span>
          <span className="font-serif text-[32px] leading-none">{levelCopy.levelOf(level.level)}</span>
          {level.evidence.length > 0 && (
            <ul aria-label={levelCopy.evidenceLabel} className="m-0 flex list-none flex-col gap-1.5 p-0">
              {level.evidence.map((line) => (
                <li key={line} lang={level.language} className="rounded-md bg-sand-soft px-3 py-2 text-small">
                  “{line}”
                </li>
              ))}
            </ul>
          )}
          <p className="m-0 text-caption text-taupe">{levelCopy.notAGrade}</p>
        </div>
      ) : (
        <p className="m-0 text-body text-ink-soft">{copy.placementNoLevel}</p>
      )}
      <p className="m-0 text-caption text-taupe">{copy.placementWhere}</p>
      <div className="flex-1" />
      <Button block onClick={onDone}>
        {copy.continue}
      </Button>
    </>
  );
}

function Saved({ mistakes }: { mistakes: number | null }) {
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
        <Link to="/">{copy.backToToday}</Link>
      </Button>
    </>
  );
}
