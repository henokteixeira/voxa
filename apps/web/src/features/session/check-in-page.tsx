import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { ConfidenceScale } from "./confidence-scale";
import { useCopy } from "@/lib/i18n/locale";
import { isMode, useModeInfo } from "./modes";
import { REFLECTION_COPY } from "./reflection-copy";
import type { CheckInState } from "./session-page";
import { BackIcon, IconButton } from "./session-parts";

/** Before a session: one tap on how ready the learner feels for the real meeting. Skippable. */
export function CheckInPage() {
  const { mode } = useParams();
  const navigate = useNavigate();
  const [value, setValue] = useState<number | null>(null);
  const copy = useCopy(REFLECTION_COPY);
  const modes = useModeInfo();
  if (!isMode(mode)) return <Navigate to="/" replace />;

  const start = (confidenceBefore?: number) =>
    navigate(`/session/${mode}`, { replace: true, state: { confidenceBefore } satisfies CheckInState });
  const question = copy.checkInQuestion(modes[mode].meeting);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-4 px-5 pt-7 pb-8">
      <div className="flex min-h-11 items-center">
        <IconButton label={copy.back} onClick={() => navigate("/")}>
          <BackIcon />
        </IconButton>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-6">
        <h1 className="m-0 text-title">{question}</h1>
        <ConfidenceScale label={copy.confidenceLabel} low={copy.notAtAll} high={copy.fully} value={value} onChange={setValue} />
        <p className="m-0 text-caption text-taupe">{copy.checkInNote}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Button block disabled={value === null} onClick={() => start(value ?? undefined)}>
          {copy.continue}
        </Button>
        <Button variant="ghost" block onClick={() => start()}>
          {copy.skip}
        </Button>
      </div>
    </main>
  );
}
