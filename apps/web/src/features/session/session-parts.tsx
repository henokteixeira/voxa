import { type ReactNode, type Ref, useEffect, useEffectEvent, useState } from "react";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { categoryLabel } from "@/features/mistakes/format";
import { captionHoldMs } from "./caption-hold";
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

/**
 * One line of the chat. With `scroll`, a long line scrolls inside the card past a set height,
 * so the screen does not grow with the text (the live screen; the transcript already scrolls as a whole).
 */
export function CaptionCard(props: { caption: Caption; textRef?: Ref<HTMLParagraphElement>; scroll?: boolean }) {
  const { caption, textRef, scroll } = props;
  const { parts } = useCopy(SESSION_COPY);
  const scrollClass = scroll ? " max-h-[30dvh] overflow-y-auto overscroll-contain" : "";
  return (
    <div className="flex flex-col gap-1 rounded-md bg-paper px-[18px] py-4 shadow-card">
      <span className="text-label text-taupe">{caption.who === "tutor" ? parts.tutor : parts.you}</span>
      <p ref={textRef} tabIndex={textRef ? -1 : undefined} lang="en" className={`m-0 text-body outline-none${scrollClass}`}>
        {caption.text}
      </p>
    </div>
  );
}

const FADE_MS = 300;

/**
 * The learner's last words, shown so they can check the transcription, then faded away
 * so the screen stays calm. The transcript keeps them. Key it by the caption, so a new line starts over.
 */
export function FadingCaption({ caption, onGone }: { caption: Caption; onGone: () => void }) {
  const [fading, setFading] = useState(false);
  // The parent remembers the faded line, so it stays gone when the screen comes back to it.
  const gone = useEffectEvent(onGone);
  useEffect(() => {
    const hold = captionHoldMs(caption.text);
    const fade = setTimeout(() => setFading(true), hold);
    const done = setTimeout(() => gone(), hold + FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [caption.text]);
  return (
    <div className={`transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}>
      <CaptionCard caption={caption} />
    </div>
  );
}

/** A small, discreet action under the voice ball: it is there when needed, without pulling the eye. */
export function QuietLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 self-center rounded-full border-none bg-transparent px-3 text-caption text-taupe transition-colors duration-150 hover:bg-sand-soft hover:text-ink"
    >
      {children}
    </button>
  );
}

export function HintCard(props: { step: number; said: string | null; tip: string; help?: string | null; type?: string | null }) {
  const { step, said, tip, help, type } = props;
  const { parts } = useCopy(SESSION_COPY);
  const { locale } = useLocale();
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
        <span className="text-label text-honey-ink">
          {type ? `${parts.hint} · ${categoryLabel(type, locale)}` : parts.hint}
        </span>
        <p lang="en" className="m-0 text-phrase">{tip}</p>
        {said && (
          <span className="flex flex-col gap-0.5">
            <span className="text-caption text-taupe">{parts.youSaid}</span>
            <mark lang="en" className="self-start rounded-[6px] bg-honey/35 px-1.5 py-0.5 text-small text-ink">
              “{said}”
            </mark>
          </span>
        )}
        {help && <HelpLine text={help} divider="border-honey/30" />}
      </section>
    </>
  );
}

export function RevealCard(props: { message: string; help?: string | null; rule?: { name: string; rule: string } | null }) {
  const { message, help, rule } = props;
  const { parts } = useCopy(SESSION_COPY);
  return (
    <section aria-label={parts.correctForm} className="flex flex-col gap-2 rounded-md bg-sage-soft p-4">
      <span className="text-label text-sage-ink">{parts.correctForm}</span>
      <p lang="en" className="m-0 text-phrase">{message}</p>
      {rule && (
        <p className="m-0 text-small text-ink-soft">
          <b>{rule.name}.</b> {rule.rule}
        </p>
      )}
      {help && <HelpLine text={help} divider="border-sage/40" />}
      <span className="text-caption text-taupe">{parts.savedToBank}</span>
    </section>
  );
}

/** The written help (first language) as a quiet line inside a correction card: one card, not two. */
function HelpLine({ text, divider }: { text: string; divider: string }) {
  const { parts } = useCopy(SESSION_COPY);
  return (
    <div role="note" aria-label={parts.help} className={`flex flex-col gap-0.5 border-t pt-2 ${divider}`}>
      <span className="text-caption text-taupe">{parts.help}</span>
      <p lang="pt-BR" className="m-0 text-small text-ink-soft">{text}</p>
    </div>
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
