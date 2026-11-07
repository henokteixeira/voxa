import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** How long the closing animation runs before the sheet unmounts. Matches `.vx-sheet-out` in index.css. */
export const SHEET_EXIT_MS = 200;

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Modal sheet: slides up from the bottom on phones, scales in at the center on wide screens.
 * Closes on the backdrop, Escape, or `close()` passed to children; the exit animates, then `onClose` runs.
 */
export function Sheet({
  label,
  closeLabel,
  onClose,
  dismissible = true,
  className,
  children,
}: {
  label: string;
  closeLabel: string;
  onClose: () => void;
  /** False for sheets that need an explicit choice (no backdrop or Escape close). */
  dismissible?: boolean;
  className?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    if (prefersReducedMotion()) return onClose();
    setClosing(true);
    window.setTimeout(onClose, SHEET_EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    if (!dismissible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, dismissible]);

  // Portaled to <body>: an animated ancestor (the page fade-in) would otherwise trap `position: fixed`.
  return createPortal(
    <div
      data-state={closing ? "closed" : "open"}
      className="group fixed inset-0 z-10 flex flex-col justify-end lg:items-center lg:justify-center lg:p-8"
    >
      <button
        type="button"
        aria-label={closeLabel}
        tabIndex={-1}
        disabled={!dismissible}
        onClick={close}
        className="vx-fade absolute inset-0 cursor-pointer border-none bg-[rgba(46,37,32,0.32)] disabled:cursor-default"
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          "vx-sheet relative mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col gap-3 overflow-y-auto overscroll-contain rounded-t-[28px] bg-linen px-5 pt-3 pb-[max(32px,env(safe-area-inset-bottom))] outline-none lg:rounded-[28px] lg:px-6 lg:pt-6 lg:pb-6",
          className,
        )}
      >
        <span className="h-[5px] w-10 shrink-0 self-center rounded-[3px] bg-sand lg:hidden" aria-hidden="true" />
        {typeof children === "function" ? children(close) : children}
      </div>
    </div>,
    document.body,
  );
}
