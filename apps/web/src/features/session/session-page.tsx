import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { VoiceBall } from "@/components/voice-ball";

/** Placeholder until the live voice session lands. */
export function SessionPage() {
  const { mode } = useParams();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-5 px-5 text-center">
      <VoiceBall state="thinking" size={160} />
      <h1 className="m-0 text-title">Voice sessions are almost here</h1>
      <p className="m-0 text-caption text-taupe">The {mode?.replace("_", " ")} session will open on this screen.</p>
      <Button variant="secondary" block asChild>
        <Link to="/">Back to Today</Link>
      </Button>
    </main>
  );
}
