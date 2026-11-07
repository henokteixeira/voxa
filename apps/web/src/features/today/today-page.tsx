import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SegmentedSetting } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { VoiceBall } from "@/components/voice-ball";
import { useModeInfo } from "@/features/session/modes";
import { DailyGoalSetting, SoundSetting } from "@/features/settings/practice-settings";
import { TodayGoalCard } from "@/features/xp/today-goal-card";
import { useTodayProgress } from "@/features/xp/use-today-progress";
import { takeSavedSession } from "@/features/session/saved-session";
import { useApi } from "@/hooks/use-api";
import { useApiStatus } from "@/hooks/use-api-status";
import { useOnline } from "@/hooks/use-online";
import { MEETING_MODES } from "@/lib/api";
import { PLACEMENT_PATH } from "@/features/progress/level-card";
import { useLevel } from "@/features/progress/use-level";
import { LOCALES, useCopy, useLocale } from "@/lib/i18n/locale";
import { PAUSE_CHOICES_MS, readPauseMs, savePauseMs } from "@/lib/voice/pause-setting";
import { cn } from "@/lib/utils";
import { LANGUAGE_NAMES, TODAY_COPY } from "./today-copy";

/** Two-option switch for the interface language. The conversation stays in the language being learned. */
function LanguageSwitch({ label }: { label: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <div role="group" aria-label={label} className="flex rounded-pill bg-sand-soft p-1">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={l === locale}
          onClick={() => setLocale(l)}
          className={cn(
            "min-h-11 min-w-11 cursor-pointer rounded-pill border-none bg-transparent px-3 text-sm font-bold text-taupe",
            l === locale && "bg-paper text-ink shadow-tab",
          )}
        >
          <span aria-hidden="true">{l === "en" ? "EN" : "PT"}</span>
          <span lang={l} className="sr-only">
            {LANGUAGE_NAMES[l]}
          </span>
        </button>
      ))}
    </div>
  );
}

/** How long the learner can stay quiet before their turn is sent. */
function PauseSetting({ title, hint, seconds }: { title: string; hint: string; seconds: (ms: number) => string }) {
  const [pauseMs, setPauseMs] = useState(readPauseMs);
  return (
    <SegmentedSetting
      title={title}
      hint={hint}
      options={PAUSE_CHOICES_MS.map((ms) => ({ value: ms, label: seconds(ms) }))}
      value={pauseMs}
      onChange={(ms) => {
        setPauseMs(ms);
        savePauseMs(ms);
      }}
    />
  );
}

/** The app's promise, always in view: mistakes are part of learning, and nobody is grading. */
function Welcome({ title, body }: { title: string; body: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1.5 rounded-lg bg-honey-soft px-5 py-4 text-ink">
      <h2 id={id} className="m-0 text-body-strong">
        {title}
      </h2>
      <p className="m-0 text-caption text-ink-soft">{body}</p>
    </section>
  );
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** Today: one suggested session, everything else secondary. */
export function TodayPage() {
  const [now] = useState(() => new Date());
  const [choosing, setChoosing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { status, retry } = useApiStatus();
  const online = useOnline();
  const copy = useCopy(TODAY_COPY);
  const { locale } = useLocale();
  const modes = useModeInfo();
  const api = useApi();
  const progress = useTodayProgress();
  const reloadProgress = progress.reload;
  // When the API comes back (e.g. after "Check again"), load the goal it could not give before.
  const lastStatus = useRef(status);
  useEffect(() => {
    if (status === "ok" && lastStatus.current !== "ok" && lastStatus.current !== "checking") reloadProgress();
    lastStatus.current = status;
  }, [status, reloadProgress]);
  // A session left mid-way (closed tab): continue it, unless it is too old (then it is ended with its summary).
  const [paused] = useState(() => takeSavedSession(api));
  // Before the first placement, the suggested session is the placement interview.
  const level = useLevel();
  const needsPlacement = level.view?.current === null;
  const date = now.toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" });

  return (
    <>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="text-label text-taupe">{date}</span>
        <div className="flex items-center gap-2">
          <LanguageSwitch label={copy.language} />
          <button
            type="button"
            aria-label={copy.settings}
            aria-haspopup="dialog"
            onClick={() => setSettingsOpen(true)}
            className="flex size-11 cursor-pointer items-center justify-center rounded-pill border-none bg-sand-soft text-taupe hover:text-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
          </button>
        </div>
      </div>
      <h1 className="m-0 text-display">{copy.greeting(now.getHours())}</h1>
      <Welcome title={copy.welcomeTitle} body={copy.welcomeBody} />
      {online && status === "ok" && progress.today && <TodayGoalCard today={progress.today} />}

      {!online ? (
        <Card>
          <span className="text-body-strong">{copy.offlineTitle}</span>
          <span className="text-caption text-taupe">{copy.offlineBody}</span>
        </Card>
      ) : status === "unreachable" || status === "error" ? (
        <Card className="items-center gap-4 px-5 py-7 text-center">
          <VoiceBall state="idle" size={120} face={false} dimmed />
          <h2 className="m-0 text-title">{copy.problem[status].title}</h2>
          <p className="m-0 text-caption text-taupe">{copy.problem[status].detail}</p>
          <Button block onClick={retry}>
            {copy.checkAgain}
          </Button>
        </Card>
      ) : paused ? (
        <Card className="items-center gap-3 px-5 py-6 text-center">
          <VoiceBall state="idle" size={104} />
          <h2 className="m-0 text-heading">{copy.pausedTitle}</h2>
          <p className="m-0 text-caption text-taupe">{copy.pausedBody(modes[paused.mode].title, clock(paused.elapsedSeconds))}</p>
          <Button block asChild>
            <Link to={`/session/${paused.mode}`}>{copy.continueSession}</Link>
          </Button>
        </Card>
      ) : level.view === undefined ? (
        // Wait for the level before offering a session, so Start never leads to the wrong one.
        <Card aria-busy="true" className="items-center gap-3 px-5 py-6 text-center">
          <VoiceBall state="idle" size={104} />
        </Card>
      ) : needsPlacement ? (
        <Card className="items-center gap-3 px-5 py-6 text-center">
          <VoiceBall state="idle" size={104} />
          <h2 className="m-0 text-heading">{copy.placementTitle}</h2>
          <p className="m-0 text-caption text-taupe">{copy.placementBody}</p>
          <Button block asChild>
            <Link to={PLACEMENT_PATH}>{copy.start}</Link>
          </Button>
        </Card>
      ) : (
        <Card className="items-center gap-3 px-5 py-6 text-center">
          <VoiceBall state="idle" size={104} />
          <h2 className="m-0 text-heading">{copy.readyTitle}</h2>
          <p className="m-0 text-caption text-taupe">{copy.readyBody(modes.daily.title)}</p>
          <Button block asChild>
            <Link to="/session/daily/check-in">{copy.start}</Link>
          </Button>
        </Card>
      )}

      {online && status === "ok" && (
        <Button variant="ghost" block aria-haspopup="dialog" onClick={() => setChoosing(true)}>
          {copy.otherPractice}
        </Button>
      )}

      {settingsOpen && (
        <Sheet label={copy.settings} closeLabel={copy.close} onClose={() => setSettingsOpen(false)}>
          <h2 className="m-0 text-heading">{copy.settings}</h2>
          {/* A new practice time changes the goal: the card takes what the server answered. */}
          <DailyGoalSetting onSaved={progress.set} />
          <PauseSetting title={copy.pauseTitle} hint={copy.pauseHint} seconds={copy.seconds} />
          <SoundSetting />
        </Sheet>
      )}

      {choosing && online && status === "ok" && (
        <Sheet label={copy.otherPractice} closeLabel={copy.close} onClose={() => setChoosing(false)}>
          <h2 className="m-0 text-heading">{copy.otherPractice}</h2>
          <nav aria-label={copy.otherPractice} className="flex flex-col gap-3">
            {MEETING_MODES.map((mode) => (
              <Link
                key={mode}
                to={`/session/${mode}/check-in`}
                className="flex min-h-14 items-center gap-3 rounded-md bg-paper px-5 py-4 text-ink no-underline shadow-card transition-[transform,background-color] duration-150 hover:bg-sand-soft motion-safe:active:scale-[0.98]"
              >
                <span aria-hidden="true" className="size-3.5 shrink-0 rounded-full" style={{ background: modes[mode].color }} />
                <span className="flex flex-1 flex-col gap-0.5">
                  <b className="text-body-strong">{modes[mode].title}</b>
                  <span className="text-caption text-taupe">{modes[mode].meta}</span>
                </span>
              </Link>
            ))}
          </nav>
        </Sheet>
      )}
    </>
  );
}
