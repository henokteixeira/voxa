import { useEffect, useRef, useState } from "react";
import type { TrackView } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { TRACK_COPY } from "./track-copy";

/** Where the learner is in the guided track (A1–A2): what to do now, as "Step 2 of 5". Never a score. */
export function TrackBar({ track }: { track: TrackView }) {
  const copy = useCopy(TRACK_COPY);
  const label = copy.stepOf(track.number, track.total);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <b className="text-body-strong">{copy.stage[track.stage]}</b>
        <span className="text-caption text-taupe">{label}</span>
      </div>
      <span role="img" aria-label={label} className="flex gap-1">
        {Array.from({ length: track.total }, (_, index) => (
          <i
            key={index}
            className={cn(
              "h-1 flex-1 rounded-[2px] transition-colors duration-300",
              index + 1 < track.number ? "bg-sage" : index + 1 === track.number ? "bg-apricot" : "bg-sand",
            )}
          />
        ))}
      </span>
    </div>
  );
}

/**
 * The words the tutor gave for the next turn: the model sentence (hidden until a tap, so the learner listens
 * first), the sentence to change or extend, or the sentence start when stuck outside the track (B1).
 */
export function ScaffoldCard({ text, track }: { text: string; track: TrackView | null }) {
  const copy = useCopy(TRACK_COPY);
  const [shown, setShown] = useState(track?.stage !== "model");
  const words = useRef<HTMLParagraphElement>(null);
  const [tapped, setTapped] = useState(false);
  // The tapped row goes away: hand focus to the sentence it revealed.
  useEffect(() => {
    if (tapped) words.current?.focus();
  }, [tapped]);

  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => {
          setShown(true);
          setTapped(true);
        }}
        className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-md border-none bg-transparent px-5 text-small font-semibold text-taupe shadow-[inset_0_0_0_1.5px_var(--color-sand)]"
      >
        {copy.showSentence}
        <EyeIcon />
      </button>
    );
  }
  const stage = track?.stage;
  const label = stage === "model" || stage === "swap" || stage === "extend" ? copy.words[stage] : copy.words.start;
  const start = !track;
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-lg px-5 py-[18px]", start ? "bg-honey-soft" : "bg-paper shadow-card")}>
      <span className={cn("text-label", start ? "text-honey-ink" : "text-taupe")}>{label}</span>
      <p
        ref={words}
        tabIndex={-1}
        lang="en"
        className="m-0 font-serif text-[22px] leading-snug outline-none [font-variation-settings:'SOFT'_60]"
      >
        {text}
      </p>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
