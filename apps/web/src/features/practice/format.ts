import type { Locale } from "@/lib/i18n/locale";

/** "tomorrow", "in 3 days" or "today", by calendar day, for when a review item comes back. */
export function comesBack(iso: string, now: Date, locale: Locale = "en"): string {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.max(0, Math.round((day(new Date(iso)) - day(now)) / 86_400_000));
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(days, "day");
}
