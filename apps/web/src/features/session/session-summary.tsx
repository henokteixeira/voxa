import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { VoiceBall } from "@/components/voice-ball";
import type { FluencySignals, Mode, SessionMistake, SessionSummary } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ConfidenceScale } from "./confidence-scale";
import { MODE_INFO, useModeInfo } from "./modes";

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
  const [step, setStep] = useState<Step>(summary ? "result" : "saved");
  const [after, setAfter] = useState<number | null>(null);

  if (!summary || step === "saved") return <Saved mistakes={summary?.mistakes.length ?? null} />;
  const { mistakes } = summary;

  if (step === "result") {
    return (
      <>
        <div className="flex flex-col gap-1 pt-2">
          <span className="text-label text-taupe">
            {modes[mode].title} · {props.elapsed}
          </span>
          <h1 className="m-0 text-title">Session done</h1>
        </div>
        <Signals signals={summary.signals} mistakes={mistakes} />
        <div className="flex-1" />
        <Button block onClick={() => setStep(mistakes.length ? "mistakes" : "confidence")}>
          {mistakes.length ? "See your mistakes" : "Continue"}
        </Button>
      </>
    );
  }

  if (step === "mistakes") {
    const fixed = mistakes.filter((m) => m.selfCorrected).length;
    return (
      <>
        <div className="flex flex-col gap-1 pt-2">
          <span className="text-label text-honey-ink">
            {plural(mistakes.length, "mistake")} · {fixed} fixed by you
          </span>
          <h1 className="m-0 text-title">What to keep</h1>
        </div>
        <ul aria-label="Mistakes of this session" className="m-0 flex flex-1 list-none flex-col gap-3 overflow-y-auto p-0">
          {mistakes.map((m, i) => (
            <li key={i}>
              <MistakeRow mistake={m} />
            </li>
          ))}
        </ul>
        <Button block onClick={() => setStep("confidence")}>
          Continue
        </Button>
      </>
    );
  }

  const before = summary.confidence.before;
  const label = `And now, how confident do you feel about a real ${MODE_INFO[mode].meeting}?`;
  return (
    <>
      <div className="flex flex-1 flex-col justify-center gap-6">
        <h1 className="m-0 text-title">{label}</h1>
        <ConfidenceScale label="Confidence from 1 to 5" value={after} onChange={setAfter} before={before} />
        {before !== null && <p className="m-0 text-caption text-taupe">Outlined: what you said before the session ({before}).</p>}
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
          Continue
        </Button>
        <Button variant="ghost" block onClick={() => setStep("saved")}>
          Skip
        </Button>
      </div>
    </>
  );
}

function Signals({ signals, mistakes }: { signals: FluencySignals; mistakes: SessionMistake[] }) {
  const hinted = mistakes.filter((m) => m.severity === "serious");
  const tiles = [
    {
      name: "You spoke",
      value: signals.speakingShare === null ? null : `${Math.round(signals.speakingShare * 100)}%`,
      note: "of the time",
      empty: "not measured",
    },
    {
      name: "Fixed yourself",
      value: hinted.length ? `${hinted.filter((m) => m.selfCorrected).length} of ${hinted.length}` : null,
      note: "after a hint",
      empty: "no hints needed",
    },
    {
      name: "Pause before answering",
      value: signals.averagePauseMs === null ? null : `${(signals.averagePauseMs / 1000).toFixed(1)} s`,
      note: "average",
      empty: "not measured",
    },
    {
      name: "Mistakes",
      value: signals.mistakesPer100Words === null ? null : String(Math.round(signals.mistakesPer100Words * 10) / 10),
      note: "per 100 words",
      empty: "no words heard",
    },
  ];
  return (
    <dl aria-label="Fluency signals" className="m-0 grid grid-cols-2 gap-2.5">
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

const RESOLUTION = {
  fixed: { text: "Fixed after a hint", className: "bg-sage-soft text-sage-ink" },
  answer: { text: "Needed the answer", className: "bg-honey-soft text-honey-ink" },
  small: { text: "Small mistake", className: "bg-sand-soft text-taupe" },
};

function MistakeRow({ mistake }: { mistake: SessionMistake }) {
  const resolution =
    mistake.severity === "minor" ? RESOLUTION.small : mistake.selfCorrected ? RESOLUTION.fixed : RESOLUTION.answer;
  return (
    <div className="flex flex-col gap-2">
      <span className={cn("self-start rounded-pill px-2.5 py-1 text-[12px] font-bold", resolution.className)}>
        {resolution.text}
      </span>
      <div className="flex flex-col gap-1.5 rounded-md bg-paper px-4 py-3.5 shadow-card">
        <span className="flex justify-between gap-3 text-caption text-taupe">
          <span className="capitalize">{mistake.category}</span>
          <span>{mistake.occurrences > 1 ? `Seen ${mistake.occurrences} times` : "New"}</span>
        </span>
        <span className="text-small text-taupe line-through">{mistake.original}</span>
        <span className="text-phrase">{mistake.correction}</span>
      </div>
    </div>
  );
}

function Saved({ mistakes }: { mistakes: number | null }) {
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <VoiceBall state="success" size={160} />
        <h1 className="m-0 text-title">Session saved</h1>
        <p className="m-0 text-caption text-taupe">
          {mistakes === null ? "Your session is saved." : `${plural(mistakes, "mistake")} saved to your mistake bank.`}
        </p>
      </div>
      <Button block asChild>
        <Link to="/">Back to Today</Link>
      </Button>
    </>
  );
}

function plural(n: number, word: string) {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}
