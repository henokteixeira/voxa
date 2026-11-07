import { type ReactNode, useState } from "react";
import { useCopy } from "@/lib/i18n/locale";
import { SESSION_COPY } from "./session-copy";
import type { Caption } from "./session-state";

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-paper text-ink shadow-card transition-[transform,background-color] duration-150 hover:bg-sand-soft motion-safe:active:scale-[0.92]"
    >
      {children}
    </button>
  );
}

export const PauseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M9 6v12M15 6v12" />
  </svg>
);

export const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

export const TranscriptIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M5 7h14M5 12h14M5 17h9" />
  </svg>
);

export function CaptionCard({ caption }: { caption: Caption }) {
  const { parts } = useCopy(SESSION_COPY);
  return (
    <div className="flex flex-col gap-1 rounded-md bg-paper px-[18px] py-4 shadow-card">
      <span className="text-label text-taupe">{caption.who === "tutor" ? parts.tutor : parts.you}</span>
      <p lang="en" className="m-0 text-body">{caption.text}</p>
    </div>
  );
}

/**
 * The latest line on the main screen. The tutor's words stay hidden until a tap,
 * so the learner listens first; their own words show so they can check the transcription.
 * Give it a `key` per caption so each new tutor line starts hidden again.
 */
export function LatestCaption({ caption }: { caption: Caption }) {
  const { parts } = useCopy(SESSION_COPY);
  const [shown, setShown] = useState(false);
  if (caption.who !== "tutor" || shown) return <CaptionCard caption={caption} />;
  return (
    <div className="flex flex-col gap-1 rounded-md bg-paper px-[18px] py-4 shadow-card">
      <span className="text-label text-taupe">{parts.tutor}</span>
      <button
        type="button"
        onClick={() => setShown(true)}
        className="cursor-pointer self-start border-none bg-transparent p-0 text-left text-body text-ink-soft underline decoration-sand underline-offset-4 hover:text-ink"
      >
        {parts.showTutorLine}
      </button>
    </div>
  );
}

export function HintCard({ step, said, tip }: { step: number; said: string | null; tip: string }) {
  const { parts } = useCopy(SESSION_COPY);
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {[1, 2].map((n) => (
            <i key={n} className={`h-1.5 w-7 rounded-[3px] ${n <= step ? "bg-honey" : "bg-sand"}`} />
          ))}
        </span>
        <span className="text-caption text-taupe">{parts.hintOf(step)}</span>
      </div>
      <section aria-label={parts.hintOf(step)} className="flex flex-col gap-2 rounded-md bg-honey-soft p-4">
        <span className="text-label text-honey-ink">{parts.hint}</span>
        {said && (
          <span lang="en" className="text-phrase">
            “{said}”
          </span>
        )}
        <p lang="en" className="m-0 text-body">{tip}</p>
      </section>
    </>
  );
}

export function RevealCard({ message }: { message: string }) {
  const { parts } = useCopy(SESSION_COPY);
  return (
    <>
      <section aria-label={parts.correctForm} className="flex flex-col gap-2 rounded-md bg-sage-soft p-4">
        <span className="text-label text-sage-ink">{parts.correctForm}</span>
        <p lang="en" className="m-0 text-phrase">{message}</p>
      </section>
      <span className="text-center text-caption text-taupe">{parts.savedToBank}</span>
    </>
  );
}

/** The tutor's help in the learner's first language: written only, never spoken. */
export function SupportNote({ text }: { text: string }) {
  const { parts } = useCopy(SESSION_COPY);
  return (
    <aside role="note" aria-labelledby="support-title" className="flex flex-col gap-1 rounded-md bg-sand-soft px-[18px] py-4">
      <span id="support-title" className="text-label text-taupe">{parts.help}</span>
      <p lang="pt-BR" className="m-0 text-body">{text}</p>
    </aside>
  );
}
