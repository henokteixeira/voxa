import { BALL_RING_SPACE } from "@/components/ball-ring";
import { useContext, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { TimeRing } from "@/components/time-ring";
import { VoiceBall } from "@/components/voice-ball";
import { RoundMeter } from "@/features/faster/round-meter";
import { VoiceDepsContext } from "@/features/session/voice-deps";
import { MISSION_PATH } from "@/features/mission/mission-steps";
import { useApi } from "@/hooks/use-api";
import { ApiError, type CheckInResult } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { type Microphone, MicrophoneUnavailableError } from "@/lib/voice/microphone";
import { readPauseMs } from "@/lib/voice/pause-setting";
import { DEFAULT_TURN_OPTIONS } from "@/lib/voice/turn-detector";
import { CHECK_IN_COPY } from "./check-in-copy";
import { CheckInComparison } from "./check-in-result";
import { ClipRecorder } from "./clip-recorder";

export const CHECK_IN_PATH = "/check-in";

type Step =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: "microphone" | "load" }
  | { kind: "ready"; problem?: "not_heard" | "failed" | "not_due" }
  | { kind: "recording"; startedAt: number }
  | { kind: "saving" }
  | { kind: "result"; result: CheckInResult };

const BALL = 180;
const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/**
 * The check-in every 2 weeks: the same 2-minute task with no help and no correction. The whole stretch is
 * recorded (so it can be heard later), measured like a "say it faster" round, and compared with the last one.
 */
export function CheckInPage() {
  const api = useApi();
  const copy = useCopy(CHECK_IN_COPY);
  // From the mission (step 0), the check-in goes back to it; only that address is followed.
  const [params] = useSearchParams();
  const back = params.get("next") === MISSION_PATH ? MISSION_PATH : "/";
  const { openMicrophone } = useContext(VoiceDepsContext);
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [limitMs, setLimitMs] = useState(120_000);
  const [now, setNow] = useState(0);
  const mic = useRef<Microphone | null>(null);
  const meter = useRef(new RoundMeter());
  const clip = useRef(new ClipRecorder());
  const recording = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const silenceMs = readPauseMs();
    const opening = openMicrophone(
      {
        onAudio: (frame, rate) => recording.current && clip.current.push(frame, rate),
        onSpeechStart: () =>
          recording.current && meter.current.speechStarted(performance.now() - DEFAULT_TURN_OPTIONS.minSpeechMs),
        // The turns only measure the speech; the words come from the whole recording.
        onTurn: (_wav, turn) =>
          recording.current &&
          meter.current.turnEnded(performance.now(), {
            trailingSilenceMs: turn?.trailingSilenceMs ?? silenceMs,
            pausesMs: turn?.pausesMs,
          }),
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
    Promise.all([opening, api.checkIns()])
      .then(([, overview]) => {
        if (cancelled) return;
        setLimitMs(overview.limitMs);
        if (overview.due) return setStep({ kind: "ready" });
        // Nothing to record: the microphone goes off.
        mic.current?.stop();
        mic.current = null;
        setStep({ kind: "ready", problem: "not_due" });
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
  }, [api, openMicrophone]);

  function start() {
    meter.current = new RoundMeter();
    clip.current = new ClipRecorder();
    recording.current = true;
    mic.current?.unlock();
    mic.current?.resume();
    const startedAt = performance.now();
    setNow(startedAt);
    setStep({ kind: "recording", startedAt });
  }

  async function finish() {
    // The timer and "I'm done" can both end it: only the first one does.
    if (!recording.current) return;
    mic.current?.sendNow();
    recording.current = false;
    mic.current?.pause();
    const { speechMs, longPausesMs } = meter.current.measure();
    if (speechMs === 0) return setStep({ kind: "ready", problem: "not_heard" });
    setStep({ kind: "saving" });
    try {
      const wav = clip.current.wav();
      // The frames are in the WAV now: free them (about 4 MB for 2 minutes).
      clip.current = new ClipRecorder();
      const result = await api.recordCheckIn(wav, { speechMs, pausesMs: longPausesMs });
      // Done for 2 weeks: the microphone goes off.
      mic.current?.stop();
      mic.current = null;
      setStep({ kind: "result", result });
    } catch (error) {
      setStep({ kind: "ready", problem: error instanceof ApiError && error.kind === "invalid" ? "not_heard" : "failed" });
    }
  }

  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  const startedAt = step.kind === "recording" ? step.startedAt : null;
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => {
      const at = performance.now();
      setNow(at);
      if (at - startedAt >= limitMs) void finishRef.current();
    }, 250);
    return () => clearInterval(timer);
  }, [startedAt, limitMs]);

  const leftMs = startedAt === null ? limitMs : limitMs - (now - startedAt);
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col gap-5 px-5 pt-7 pb-8">
      <div className="flex min-h-11 items-center justify-between">
        <Link
          to={back}
          aria-label={copy.back}
          className="inline-flex size-11 items-center justify-center rounded-full bg-paper text-ink shadow-card"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <span className="text-label text-taupe">{copy.label}</span>
        <span className="w-11" />
      </div>

      {step.kind === "loading" && (
        <div className="flex flex-1 items-center justify-center">
          <VoiceBall state="thinking" size={140} />
        </div>
      )}

      {step.kind === "unavailable" && (
        <p className="m-0 flex flex-1 items-center justify-center text-center text-body text-ink-soft">
          {step.reason === "microphone" ? copy.noMicrophone : copy.loadFailed}
        </p>
      )}

      {step.kind === "result" && <CheckInComparison result={step.result} doneTo={back} />}

      {(step.kind === "ready" || step.kind === "recording" || step.kind === "saving") && (
        <>
          <h1 className="sr-only">{copy.label}</h1>
          <section aria-label={copy.yourTask} className="flex flex-col gap-1.5 rounded-lg bg-paper px-5 py-4 shadow-card">
            <span className="text-label text-taupe">{copy.yourTask}</span>
            <span className="font-serif text-[22px] leading-snug">{copy.task}</span>
          </section>
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className="relative inline-flex" style={{ padding: BALL_RING_SPACE }}>
              <VoiceBall state={step.kind === "saving" ? "thinking" : startedAt !== null ? "listening" : "idle"} size={BALL} />
              {startedAt !== null && <TimeRing ballSize={BALL} share={Math.max(0, leftMs) / limitMs} />}
            </div>
            <span aria-hidden="true" className="text-label text-mist-ink tabular-nums">
              {startedAt !== null ? copy.left(clock(leftMs)) : ""}
            </span>
            <span aria-live="polite" className="sr-only">
              {step.kind === "saving" ? copy.saving : startedAt !== null ? copy.listening : ""}
            </span>
          </div>
          {step.kind === "ready" && step.problem && (
            <p role="alert" className="m-0 text-center text-caption text-honey-ink">
              {step.problem === "not_due" ? copy.notDue : step.problem === "failed" ? copy.failed : copy.notHeard}
            </p>
          )}
          <p className="m-0 text-center text-caption text-taupe">{copy.noHelp}</p>
          {step.kind === "ready" && step.problem !== "not_due" && (
            <Button block onClick={start}>
              {step.problem ? copy.retry : copy.begin(clock(limitMs))}
            </Button>
          )}
          {startedAt !== null && (
            <Button block variant="ghost" autoFocus onClick={() => void finish()}>
              {copy.done}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
