import { useContext, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { VoiceBall } from "@/components/voice-ball";
import { VoiceDepsContext } from "@/features/session/voice-deps";
import { useApi } from "@/hooks/use-api";
import type { FasterRoundsView } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { type Microphone, MicrophoneUnavailableError } from "@/lib/voice/microphone";
import { readPauseMs } from "@/lib/voice/pause-setting";
import { DEFAULT_TURN_OPTIONS } from "@/lib/voice/turn-detector";
import { FASTER_COPY } from "./faster-copy";
import { RoundMeter } from "./round-meter";

type Result = NonNullable<FasterRoundsView["result"]>;
type Step =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: "microphone" | "load" }
  | { kind: "ready"; round: number; limitMs: number; problem?: "not_heard" | "failed" }
  | { kind: "telling"; round: number; limitMs: number; startedAt: number }
  | { kind: "saving"; round: number; limitMs: number }
  | { kind: "result"; result: Result };

const ROUND_LIMITS_MS = [120_000, 90_000, 60_000];
const BALL = 180;

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/**
 * "Say it faster" after a session: the learner tells the same content 3 times in 2:00, 1:30 and 1:00,
 * with no correction, then sees how his pace changed. A round may take several microphone turns;
 * it ends when the time is up or on "I'm done". `onDone` is called when he continues or skips.
 */
export function FasterRun({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const api = useApi();
  const copy = useCopy(FASTER_COPY);
  const { openMicrophone } = useContext(VoiceDepsContext);
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [now, setNow] = useState(0);
  const mic = useRef<Microphone | null>(null);
  const meter = useRef(new RoundMeter());
  const transcripts = useRef<Promise<void>[]>([]);
  const telling = useRef(false);
  const language = useRef("en");

  const show = (view: FasterRoundsView) =>
    setStep(
      view.result
        ? { kind: "result", result: view.result }
        : { kind: "ready", round: view.nextRound ?? 1, limitMs: view.nextLimitMs ?? ROUND_LIMITS_MS[0] },
    );

  useEffect(() => {
    let cancelled = false;
    const silenceMs = readPauseMs();
    const opening = openMicrophone(
      {
        // "start" fires once speech has lasted the detector's minimum: it began that much earlier.
        onSpeechStart: () =>
          telling.current && meter.current.speechStarted(performance.now() - DEFAULT_TURN_OPTIONS.minSpeechMs),
        onTurn: (wav, turn) => {
          if (!telling.current) return;
          const place = meter.current.turnEnded(performance.now(), {
            trailingSilenceMs: turn?.trailingSilenceMs ?? silenceMs,
            pausesMs: turn?.pausesMs,
          });
          transcripts.current.push(api.transcribe(wav, language.current).then((text) => meter.current.heard(place, text)));
        },
      },
      { endSilenceMs: silenceMs },
    );
    opening
      .then((opened) => {
        if (cancelled) return opened.stop();
        opened.pause();
        mic.current = opened;
      })
      .catch(() => {});
    Promise.all([opening, api.fasterRounds(sessionId)])
      .then(([, view]) => {
        if (cancelled) return;
        language.current = view.language;
        show(view);
      })
      .catch(
        (error: unknown) =>
          !cancelled &&
          setStep({ kind: "unavailable", reason: error instanceof MicrophoneUnavailableError ? "microphone" : "load" }),
      );
    return () => {
      cancelled = true;
      mic.current?.stop();
      mic.current = null;
    };
    // Opened once for the whole run.
  }, [api, openMicrophone, sessionId]);

  function start(round: number, limitMs: number) {
    meter.current = new RoundMeter();
    transcripts.current = [];
    telling.current = true;
    mic.current?.unlock();
    mic.current?.resume();
    const startedAt = performance.now();
    setNow(startedAt);
    setStep({ kind: "telling", round, limitMs, startedAt });
  }

  async function finish(round: number, limitMs: number) {
    // The timer and "I'm done" can both end the round: only the first one does.
    if (!telling.current) return;
    mic.current?.sendNow();
    telling.current = false;
    mic.current?.pause();
    setStep({ kind: "saving", round, limitMs });
    try {
      // A turn that couldn't be transcribed only leaves its words out.
      await Promise.allSettled(transcripts.current);
      const measure = meter.current.measure();
      if (!measure.transcript) return setStep({ kind: "ready", round, limitMs, problem: "not_heard" });
      show(await api.recordFasterRound(sessionId, { round, ...measure }));
    } catch {
      setStep({ kind: "ready", round, limitMs, problem: "failed" });
    }
  }

  // The round's timer calls the latest finish.
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  const tellingStep = step.kind === "telling" ? step : null;
  useEffect(() => {
    if (!tellingStep) return;
    const timer = setInterval(() => {
      const at = performance.now();
      setNow(at);
      if (at - tellingStep.startedAt >= tellingStep.limitMs) void finishRef.current(tellingStep.round, tellingStep.limitMs);
    }, 250);
    return () => clearInterval(timer);
  }, [tellingStep]);

  if (step.kind === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <VoiceBall state="thinking" size={140} />
      </div>
    );
  }

  if (step.kind === "unavailable") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="m-0 text-body text-ink-soft">{step.reason === "microphone" ? copy.noMicrophone : copy.loadFailed}</p>
        <Button variant="ghost" onClick={onDone}>
          {copy.skip}
        </Button>
      </div>
    );
  }

  if (step.kind === "result") return <PaceResult result={step.result} onDone={onDone} />;

  const { round, limitMs } = step;
  const leftMs = tellingStep ? limitMs - (now - tellingStep.startedAt) : limitMs;
  return (
    <>
      <Heading />
      <span className="sr-only">{copy.roundOf(round, ROUND_LIMITS_MS.length)}</span>
      <div aria-hidden="true" className="flex gap-2">
        {ROUND_LIMITS_MS.map((ms, i) => (
          <span
            key={ms}
            className={cn(
              "flex-1 rounded-pill py-1.5 text-center text-caption font-bold tabular-nums",
              i + 1 < round ? "bg-sage-soft text-sage-ink" : i + 1 === round ? "bg-ink text-paper" : "bg-sand-soft text-taupe",
            )}
          >
            {clock(ms)}
          </span>
        ))}
      </div>
      <p className="m-0 text-body text-ink-soft">{copy.task}</p>
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <div className="relative">
          <VoiceBall state={step.kind === "saving" ? "thinking" : tellingStep ? "listening" : "idle"} size={BALL} />
          {tellingStep && <TimeRing share={Math.max(0, leftMs) / limitMs} />}
        </div>
        <span aria-hidden="true" className="text-label text-mist-ink tabular-nums">
          {tellingStep ? copy.left(clock(leftMs)) : ""}
        </span>
        <span aria-live="polite" className="sr-only">
          {step.kind === "saving" ? copy.saving : tellingStep ? copy.listening : ""}
        </span>
      </div>
      {step.kind === "ready" && step.problem && (
        <p role="alert" className="m-0 text-center text-caption text-honey-ink">
          {step.problem === "failed" ? copy.failed : copy.notHeard}
        </p>
      )}
      <p className="m-0 text-center text-caption text-taupe">{copy.noCorrections}</p>
      {step.kind === "ready" && (
        <>
          <Button block onClick={() => start(round, limitMs)}>
            {step.problem ? copy.retry : copy.start(clock(limitMs))}
          </Button>
          <Button block variant="ghost" onClick={onDone}>
            {copy.skip}
          </Button>
        </>
      )}
      {tellingStep && (
        // Takes the focus from the start button it replaces.
        <Button block variant="ghost" autoFocus onClick={() => void finish(round, limitMs)}>
          {copy.done}
        </Button>
      )}
    </>
  );
}

function Heading() {
  const copy = useCopy(FASTER_COPY);
  return (
    <div className="flex flex-col gap-1 pt-2">
      <span className="text-label text-taupe">{copy.subtitle}</span>
      <h1 className="m-0 text-title">{copy.title}</h1>
    </div>
  );
}

/** The ring around the ball empties with the round's time. */
function TimeRing({ share }: { share: number }) {
  const size = BALL + 26;
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90"
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={4} className="stroke-sand" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - share)}
        className="stroke-honey transition-[stroke-dashoffset] duration-300 ease-linear"
      />
    </svg>
  );
}

/** Words per minute of each round; only what went better is named, and the last bar is sage. */
function PaceResult({ result, onDone }: { result: Result; onDone: () => void }) {
  const copy = useCopy(FASTER_COPY);
  const top = Math.max(1, ...result.rounds.map((r) => r.wordsPerMinute ?? 0));
  return (
    <>
      <Heading />
      <h2 className="m-0 font-serif text-[26px] leading-tight font-normal">
        {copy.result(result.paceChangePercent, result.fewerLongPauses)}
      </h2>
      <section aria-label={copy.wordsPerMinute} className="flex flex-col gap-3 rounded-lg bg-paper p-5 shadow-card">
        <span className="text-label text-taupe">{copy.wordsPerMinute}</span>
        <ol className="m-0 flex h-[150px] list-none items-end gap-3 p-0">
          {result.rounds.map((r, i) => (
            <li key={r.round} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-small font-bold tabular-nums">{r.wordsPerMinute ?? "–"}</span>
              <span
                aria-hidden="true"
                style={{ height: `${Math.round(((r.wordsPerMinute ?? 0) / top) * 100)}px` }}
                className={cn("w-full rounded-t-md", i === result.rounds.length - 1 ? "bg-sage" : "bg-mist")}
              />
              <span className="text-caption text-taupe">{copy.round(r.round)}</span>
            </li>
          ))}
        </ol>
        <span className="text-caption text-taupe">{copy.longPauses(result.rounds.map((r) => r.longPauses))}</span>
      </section>
      <div className="flex-1" />
      <Button block onClick={onDone}>
        {copy.continue}
      </Button>
    </>
  );
}
