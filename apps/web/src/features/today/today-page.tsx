import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VoiceBall } from "@/components/voice-ball";
import { useApiStatus } from "@/hooks/use-api-status";

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Today: one suggested session, everything else secondary. */
export function TodayPage() {
  const [now] = useState(() => new Date());
  const { status, retry } = useApiStatus();
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <>
      <span className="flex min-h-11 items-center text-label text-taupe">{date}</span>
      <h1 className="m-0 text-display">{greeting(now)}</h1>

      {status === "down" ? (
        <Card className="items-center gap-4 px-5 py-7 text-center">
          <VoiceBall state="idle" size={120} face={false} dimmed />
          <h2 className="m-0 text-title">Voxa's server isn't running</h2>
          <p className="m-0 text-caption text-taupe">
            Start the API on your PC (<code>pnpm dev:api</code>), then check again.
          </p>
          <Button block onClick={retry}>
            Check again
          </Button>
        </Card>
      ) : (
        <Card className="items-center gap-4 px-5 py-7 text-center">
          <VoiceBall state="idle" size={120} />
          <h2 className="m-0 font-serif text-[22px] leading-[1.3] font-normal">Your first session is ready</h2>
          <p className="m-0 text-caption text-taupe">
            Daily stand-up · about 6 min. Your mistake bank and progress start filling from here.
          </p>
          <Button block asChild>
            <Link to="/session/daily">Start</Link>
          </Button>
        </Card>
      )}
    </>
  );
}
