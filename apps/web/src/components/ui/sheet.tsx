import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** How long the closing animation runs before the sheet unmounts. Matches the exit in index.css. */
export const SHEET_EXIT_MS = 200;

/** No exit animation with reduced motion, or where media queries can't be read (then nothing animates). */
function skipExit() {
  return typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Modal sheet: slides up from the bottom on phones, scales in at the center on wide screens.
 * Closes on the backdrop, Escape, a screen-reader close button, or `close()` passed to children;
 * the exit animates, then `onClose` runs once. While open, the app behind it is inert.
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
  /** Name of the close control. Omit when a button in the sheet already closes it. */
  closeLabel?: string;
  onClose: () => void;
  /** False for sheets that need an explicit choice (no backdrop or Escape close). */
  dismissible?: boolean;
  className?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // Closing twice is a no-op; with reduced motion the sheet closes at once.
  const close = useCallback(() => {
    if (skipExit()) onClose();
    else setClosing(true);
  }, [onClose]);

  // The exit animation runs, then onClose. Unmounting first (a link inside navigated) drops it.
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onClose, SHEET_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);

  // Focus moves in and the app behind goes inert; both come back on unmount.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const app = document.getElementById("root");
    const wasInert = app?.inert ?? false;
    if (app) app.inert = true;
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    return () => {
      if (app) app.inert = wasInert;
      if (opener?.isConnected) opener.focus();
    };
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
      className="fixed inset-0 z-10 flex flex-col justify-end lg:items-center lg:justify-center lg:p-8"
    >
      {/* Pointer-only backdrop; keyboard and screen readers use Escape or the close button inside. */}
      <div
        aria-hidden="true"
        onClick={dismissible ? close : undefined}
        className={cn("vx-fade absolute inset-0 bg-[rgba(46,37,32,0.32)]", dismissible && "cursor-pointer")}
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
        {dismissible && closeLabel && (
          // Hidden until focused: phones have no Escape key, so screen readers need a real control.
          <button
            type="button"
            onClick={close}
            className="sr-only cursor-pointer self-end rounded-pill border-none bg-paper px-4 py-2 font-sans text-sm font-bold text-ink focus:not-sr-only"
          >
            {closeLabel}
          </button>
        )}
        {typeof children === "function" ? children(close) : children}
      </div>
    </div>,
    document.body,
  );
}
