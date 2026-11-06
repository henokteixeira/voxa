import type { ReactNode } from "react";
import type { Caption } from "./session-state";

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-paper text-ink shadow-card"
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

export const TranscriptIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M5 7h14M5 12h14M5 17h9" />
  </svg>
);

export function CaptionCard({ caption }: { caption: Caption }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-paper px-[18px] py-4 shadow-card">
      <span className="text-label text-taupe">{caption.who === "tutor" ? "Tutor" : "You"}</span>
      <p className="m-0 text-body">{caption.text}</p>
    </div>
  );
}

export function HintCard({ step, said, tip }: { step: number; said: string | null; tip: string }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {[1, 2].map((n) => (
            <i key={n} className={`h-1.5 w-7 rounded-[3px] ${n <= step ? "bg-honey" : "bg-sand"}`} />
          ))}
        </span>
        <span className="text-caption text-taupe">Hint {step} of 2</span>
      </div>
      <section aria-label={`Hint ${step} of 2`} className="flex flex-col gap-2 rounded-md bg-honey-soft p-4">
        <span className="text-label text-honey-ink">Hint</span>
        {said && <span className="text-phrase">“{said}”</span>}
        <p className="m-0 text-body">{tip}</p>
      </section>
    </>
  );
}

export function RevealCard({ message }: { message: string }) {
  return (
    <>
      <section aria-label="The correct form" className="flex flex-col gap-2 rounded-md bg-sage-soft p-4">
        <span className="text-label text-sage-ink">The correct form</span>
        <p className="m-0 text-phrase">{message}</p>
      </section>
      <span className="text-center text-caption text-taupe">Saved to your mistake bank</span>
    </>
  );
}
