import { useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { VoiceDepsContext } from "@/features/session/voice-deps";
import { useApi } from "@/hooks/use-api";
import type { CheckInResult } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import type { Speaker } from "@/lib/voice/speaker";
import { CHECK_IN_COPY } from "./check-in-copy";
import { clearestGain, useCheckInDate } from "./check-in-format";

/** The check-in compared with the one before: only what went better gets a color; nothing is red. */
export function CheckInComparison({
  result,
  past = false,
  doneTo = "/",
}: {
  result: CheckInResult;
  /** Opened from Progress: the check-in is named by its date, not "today". */
  past?: boolean;
  doneTo?: string;
}) {
  const copy = useCopy(CHECK_IN_COPY);
  const date = useCheckInDate();
  const { checkIn, previous } = result;
  const day = past ? date(checkIn.recordedAt) : null;
  // The button that ended the recording is gone: the title takes the focus, so the result is read out.
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  const rows = previous
    ? [
        {
          label: copy.wordsPerMinute,
          before: previous.wordsPerMinute,
          now: checkIn.wordsPerMinute,
          better: (checkIn.wordsPerMinute ?? 0) > (previous.wordsPerMinute ?? Infinity),
        },
        { label: copy.longPauses, before: previous.longPauses, now: checkIn.longPauses, better: checkIn.longPauses < previous.longPauses },
      ]
    : [];
  return (
    <>
      <h1 ref={title} tabIndex={-1} className="m-0 font-serif text-[26px] leading-tight font-normal outline-none">
        {previous ? copy.gainTitle(clearestGain(checkIn, previous), day) : copy.firstTitle}
      </h1>
      {previous ? (
        <table className="w-full border-separate border-spacing-0 rounded-lg bg-paper px-5 py-2 text-body shadow-card">
          <thead>
            <tr className="text-label text-taupe">
              <th scope="col" className="py-2 text-left font-bold">
                <span className="sr-only">{copy.label}</span>
              </th>
              <th scope="col" className="w-16 py-2 text-right font-bold">
                {date(previous.recordedAt)}
              </th>
              <th scope="col" className="w-16 py-2 text-right font-bold">
                {day ?? copy.today}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="border-t border-sand-soft py-3 text-left font-normal">
                  {row.label}
                </th>
                <td className="border-t border-sand-soft py-3 text-right text-taupe tabular-nums">{row.before ?? "–"}</td>
                <td className={cn("border-t border-sand-soft py-3 text-right font-bold tabular-nums", row.better && "text-sage-ink")}>
                  {row.now ?? "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="m-0 text-body text-ink-soft">{copy.firstBody}</p>
      )}
      <HearRecordings ids={[...(previous ? [previous.id] : []), checkIn.id]} label={previous ? copy.hearBoth(date(previous.recordedAt), day) : copy.hearToday} />
      <div className="flex-1" />
      <Button block asChild>
        <Link to={doneTo}>{copy.finish}</Link>
      </Button>
    </>
  );
}

/** Plays the recordings one after the other (the old one first). */
function HearRecordings({ ids, label }: { ids: string[]; label: string }) {
  const api = useApi();
  const copy = useCopy(CHECK_IN_COPY);
  const { createSpeaker } = useContext(VoiceDepsContext);
  const speaker = useRef<Speaker | null>(null);
  const [state, setState] = useState<"idle" | "playing" | "failed">("idle");
  useEffect(() => () => speaker.current?.close(), []);

  async function play() {
    speaker.current ??= createSpeaker();
    speaker.current.unlock();
    setState("playing");
    try {
      for (const id of ids) await speaker.current.play(await api.checkInRecording(id));
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={state === "playing"}
        onClick={() => void play()}
        className="flex min-h-16 w-full cursor-pointer items-center gap-3.5 rounded-md border-none bg-paper px-4 py-3.5 text-left text-ink shadow-card disabled:cursor-default"
      >
        <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <span className="text-body-strong">{state === "playing" ? copy.playing : label}</span>
      </button>
      {state === "failed" && (
        <p role="alert" className="m-0 text-caption text-honey-ink">
          {copy.playFailed}
        </p>
      )}
    </div>
  );
}
