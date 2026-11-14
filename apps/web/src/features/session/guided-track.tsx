import { Fragment, type ReactNode } from "react";
import type { TrackView } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { GOALS_COPY } from "./goals-copy";
import { TRACK_COPY } from "./track-copy";

/**
 * Where the learner is in the step-by-step script (A1–B1), as one line: "Step 2 of 4 · Today". It replaces the goal
 * and expression chips while the script runs (decided on 2026-11-14: the screen was crowded). Never a score.
 */
export function ScriptLine({ track }: { track: TrackView }) {
  const copy = useCopy(TRACK_COPY);
  const goals = useCopy(GOALS_COPY);
  const name = track.goal ? (goals.goal[track.goal] ?? track.goal) : copy.retell;
  return (
    <p className="m-0 text-center text-caption text-taupe">
      {copy.stepOf(track.number, track.total)} · <b className="text-ink">{name}</b>
    </p>
  );
}

/** A sentence with its ___ blanks drawn as short lines to fill in. */
function WithBlanks({ text, label }: { text: string; label: string }): ReactNode {
  const parts = text.split(/_{2,}/);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && (
        <span role="img" aria-label={label} className="mx-1 inline-block h-[1.1em] w-14 translate-y-[0.2em] border-b-2 border-apricot" />
      )}
    </Fragment>
  ));
}

/**
 * The words the tutor gave for the next answer: in the script, an example to change, a sentence to complete (with key
 * words), a start, or the start of each part to put together; outside it, the sentence start when stuck (B1).
 */
export function ScaffoldCard({ text, track, keyWords = [] }: { text: string; track: TrackView | null; keyWords?: string[] }) {
  const copy = useCopy(TRACK_COPY);
  const kind = !track ? "start" : track.stage === "retell" ? "retell" : track.support === "alone" ? "start" : track.support;
  const parts = kind === "retell" ? text.split(/\s+\/\s+/).filter(Boolean) : [];
  const start = !track;
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg px-5 py-[18px]", start ? "bg-honey-soft" : "bg-paper shadow-card")}>
      <span className={cn("text-label", start ? "text-honey-ink" : "text-taupe")}>{copy.words[kind]}</span>
      {parts.length > 1 ? (
        <ol lang="en" className="m-0 flex list-decimal flex-col gap-1 pl-5 font-serif text-[19px] leading-snug">
          {parts.map((part, i) => (
            <li key={i}>{part}</li>
          ))}
        </ol>
      ) : (
        <p lang="en" className="m-0 font-serif text-[22px] leading-snug [font-variation-settings:'SOFT'_60]">
          <WithBlanks text={text} label={copy.blank} />
        </p>
      )}
      {keyWords.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="text-caption text-taupe">{copy.keyWords}</span>
          <ul aria-label={copy.keyWords} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {keyWords.map((word) => (
              <li key={word} lang="en" className="rounded-pill bg-sand-soft px-2.5 py-1 text-small text-ink">
                {word}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
