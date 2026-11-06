import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VoiceBall } from "@/components/voice-ball";
import { MODE_INFO } from "@/features/session/modes";
import { type ApiStatus, useApiStatus } from "@/hooks/use-api-status";
import { useOnline } from "@/hooks/use-online";
import { MODES } from "@/lib/api";

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const PROBLEM: Record<Extract<ApiStatus, "unreachable" | "error">, { title: string; detail: ReactNode }> = {
  unreachable: {
    title: "Voxa's server isn't running",
    detail: (
      <>
        Start the API on your PC (<code>pnpm dev:api</code>), then check again.
      </>
    ),
  },
  error: {
    title: "Voxa's server has a problem",
    detail: "It answered with an error. Check the API logs on your PC, then try again.",
  },
};

/** Today: one suggested session, everything else secondary. */
export function TodayPage() {
  const [now] = useState(() => new Date());
  const { status, retry } = useApiStatus();
  const online = useOnline();
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <>
      <span className="flex min-h-11 items-center text-label text-taupe">{date}</span>
      <h1 className="m-0 text-display">{greeting(now)}</h1>

      {!online ? (
        <Card>
          <span className="text-body-strong">Sessions need a connection</span>
          <span className="text-caption text-taupe">Connect to the internet and Voxa checks again on its own.</span>
        </Card>
      ) : status === "unreachable" || status === "error" ? (
        <Card className="items-center gap-4 px-5 py-7 text-center">
          <VoiceBall state="idle" size={120} face={false} dimmed />
          <h2 className="m-0 text-title">{PROBLEM[status].title}</h2>
          <p className="m-0 text-caption text-taupe">{PROBLEM[status].detail}</p>
          <Button block onClick={retry}>
            Check again
          </Button>
        </Card>
      ) : (
        <Card className="items-center gap-4 px-5 py-7 text-center">
          <VoiceBall state="idle" size={120} />
          <h2 className="m-0 text-heading">Your first session is ready</h2>
          <p className="m-0 text-caption text-taupe">
            Daily stand-up · about 6 min. Your mistake bank and progress start filling from here.
          </p>
          <Button block asChild>
            <Link to="/session/daily/check-in">Start</Link>
          </Button>
        </Card>
      )}

      {online && status === "ok" && (
        <nav aria-label="Other practice" className="flex flex-col gap-3 pb-2">
          <h2 className="m-0 text-label text-taupe">Other practice</h2>
          {MODES.map((mode) => (
            <Link
              key={mode}
              to={`/session/${mode}/check-in`}
              className="flex min-h-14 items-center gap-3 rounded-md bg-paper px-5 py-4 text-ink no-underline shadow-card"
            >
              <span aria-hidden="true" className="size-3.5 shrink-0 rounded-full" style={{ background: MODE_INFO[mode].color }} />
              <span className="flex flex-1 flex-col gap-0.5">
                <b className="text-body-strong">{MODE_INFO[mode].title}</b>
                <span className="text-caption text-taupe">{MODE_INFO[mode].meta}</span>
              </span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
