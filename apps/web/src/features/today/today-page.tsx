import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SegmentedSetting } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { VoiceBall } from "@/components/voice-ball";
import { useModeInfo } from "@/features/session/modes";
import { MemoryLink } from "@/features/memory/memory-link";
import { DailyGoalSetting, SoundSetting } from "@/features/settings/practice-settings";
import { TodayGoalCard } from "@/features/xp/today-goal-card";
import { TodayCheckInCard } from "@/features/check-in/today-check-in-card";
import { TodayReviewCard } from "@/features/practice/today-review-card";
import { useTodayProgress } from "@/features/xp/use-today-progress";
import { takeSavedSession } from "@/features/session/saved-session";
import { useApi } from "@/hooks/use-api";
import { useApiStatus } from "@/hooks/use-api-status";
import { useOnline } from "@/hooks/use-online";
import { onboardingSeen } from "@/features/onboarding/onboarding-seen";
import { ONBOARDING_PATH } from "@/features/onboarding/onboarding-page";
import { useLevel } from "@/features/progress/use-level";
import { LOCALES, useCopy, useLocale } from "@/lib/i18n/locale";
import { PAUSE_CHOICES_MS, readPauseMs, savePauseMs } from "@/lib/voice/pause-setting";
import { TALK_PATH } from "@/features/talk/talk-page";
import { LANGUAGE_NAMES, TODAY_COPY } from "./today-copy";

/** The interface language. The conversation stays in the language being learned. */
function LanguageSetting({ title, hint }: { title: string; hint: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <SegmentedSetting
      title={title}
      hint={hint}
      options={LOCALES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))}
      value={locale}
      onChange={setLocale}
    />
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

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** Today: what to do today. The free conversations live in Talk. */
export function TodayPage() {
  const [now] = useState(() => new Date());
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
  // Before the first placement, Start opens the onboarding, which ends in the placement interview.
  const level = useLevel();
  const needsPlacement = level.view?.current === null;
  // First run: the onboarding opens on its own, once; not over a session left mid-way.
  const [seen] = useState(onboardingSeen);
  if (needsPlacement && !seen && !paused) return <Navigate to={ONBOARDING_PATH} replace />;
  const date = now.toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" });

  return (
    <>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="text-label text-taupe">{date}</span>
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
      <h1 className="m-0 text-display">{copy.greeting(now.getHours())}</h1>
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
        // Wait for the level before showing the ready card, so the placement card is never skipped by mistake.
        <Card aria-busy="true" className="items-center gap-3 px-5 py-6 text-center">
          <VoiceBall state="idle" size={104} />
        </Card>
      ) : needsPlacement ? (
        <Card className="items-center gap-3 px-5 py-6 text-center">
          <VoiceBall state="idle" size={104} />
          <h2 className="m-0 text-heading">{copy.placementTitle}</h2>
          <p className="m-0 text-caption text-taupe">{copy.placementBody}</p>
          <Button block asChild>
            <Link to={ONBOARDING_PATH}>{copy.start}</Link>
          </Button>
        </Card>
      ) : (
        <Card className="items-center gap-3 px-5 py-6 text-center">
          <VoiceBall state="idle" size={104} />
          <h2 className="m-0 text-heading">{copy.readyTitle}</h2>
          <p className="m-0 text-caption text-taupe">{copy.readyBody}</p>
          <Button block asChild>
            <Link to={TALK_PATH}>{copy.talk}</Link>
          </Button>
        </Card>
      )}

      {online && status === "ok" && !paused && level.view && !needsPlacement && (
        <>
          <TodayCheckInCard />
          <TodayReviewCard />
        </>
      )}


      {settingsOpen && (
        <Sheet label={copy.settings} closeLabel={copy.close} onClose={() => setSettingsOpen(false)}>
          <h2 className="m-0 text-heading">{copy.settings}</h2>
          <LanguageSetting title={copy.language} hint={copy.languageHint} />
          {/* A new practice time changes the goal: the card takes what the server answered. */}
          <DailyGoalSetting onSaved={progress.set} />
          <PauseSetting title={copy.pauseTitle} hint={copy.pauseHint} seconds={copy.seconds} />
          <SoundSetting />
          <MemoryLink />
        </Sheet>
      )}
    </>
  );
}
