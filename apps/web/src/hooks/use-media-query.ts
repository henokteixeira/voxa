import { useSyncExternalStore } from "react";

/** Whether a CSS media query matches. False where matchMedia doesn't exist (tests, old browsers). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
}

/** Wide screens (laptop and up) get a side column instead of the bottom tab bar. */
export const WIDE = "(min-width: 1024px)";
