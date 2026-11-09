import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { VoiceBall } from "@/components/voice-ball";
import { TodayReviewCard } from "@/features/practice/today-review-card";
import { useModeInfo } from "@/features/session/modes";
import { TALK_PATH } from "@/features/talk/talk-page";
import { useApi } from "@/hooks/use-api";
import type { MissionView } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { MISSION_COPY } from "./mission-copy";
import { StepsBar } from "./steps-bar";
import { currentStep, MISSION_MINUTES, MISSION_PATH, MISSION_STEPS, STEP_MINUTES, stepsDone } from "./mission-steps";

/**
 * Today's one thing: the mission, with one button. Done in parts, it says the step it is on; once done,
 * "See you tomorrow", a way to talk more and the review card.
 */
export function TodayMissionCard() {
  const api = useApi();
  const copy = useCopy(MISSION_COPY);
  const modes = useModeInfo();
  const [view, setView] = useState<MissionView | "loading" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .missionToday()
      .then((mission) => active && setView(mission))
      .catch(() => active && setView("failed"));
    return () => {
      active = false;
    };
  }, [api, attempt]);

  if (view === "loading")
    return (
      <Middle>
        <VoiceBall state="idle" size={150} />
      </Middle>
    );
  if (view === "failed")
    return (
      <Middle>
        <VoiceBall state="idle" size={150} face={false} dimmed />
        <p className="m-0 text-body text-ink-soft">{copy.loadFailed}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setView("loading");
            setAttempt((n) => n + 1);
          }}
        >
          {copy.tryAgain}
        </Button>
      </Middle>
    );

  const situation = modes[view.situation].title;
  const step = currentStep(view.steps);
  if (step === null)
    return (
      <>
        <Middle>
          <VoiceBall state="success" size={150} />
          <Heading label={copy.doneLabel} title={copy.doneTitle} meta={copy.doneBody(situation)} />
        </Middle>
        <TodayReviewCard />
        <Button block variant="ghost" asChild>
          <Link to={TALK_PATH}>{copy.talkMore}</Link>
        </Button>
      </>
    );

  const started = stepsDone(view.steps) > 0 || view.steps.checkIn === true;
  let heading;
  if (step === "checkIn") heading = <Heading label={copy.checkInLabel} title={copy.checkInTitle} meta={copy.checkInBody} />;
  else if (!started) heading = <Heading label={copy.todaysMission} title={situation} meta={copy.summary(MISSION_STEPS.length, MISSION_MINUTES)} />;
  else
    heading = (
      <Heading
        label={copy.stepOf(MISSION_STEPS.indexOf(step) + 1, MISSION_STEPS.length)}
        title={step === "task" ? situation : copy.stepNames[step]}
        meta={copy.minutes(STEP_MINUTES[step])}
      />
    );
  return (
    <>
      <Middle>
        <VoiceBall state="idle" size={150} />
        {heading}
        <StepsBar now={step === "checkIn" ? -1 : MISSION_STEPS.indexOf(step)} className="w-[200px]" />
      </Middle>
      <Button block asChild>
        <Link to={MISSION_PATH}>{started ? copy.continue : copy.start}</Link>
      </Button>
    </>
  );
}

function Middle({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">{children}</div>;
}

function Heading({ label, title, meta }: { label: string; title: string; meta: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-label text-apricot-ink">{label}</span>
      <h2 className="m-0 text-display">{title}</h2>
      <span className="text-caption text-taupe">{meta}</span>
    </div>
  );
}
