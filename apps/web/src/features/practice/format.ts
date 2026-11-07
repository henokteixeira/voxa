import type { Locale } from "@/lib/i18n/locale";

/** "tomorrow", "in 3 days" or "today", by calendar day, for when a review item comes back. */
export function comesBack(iso: string, now: Date, locale: Locale = "en"): string {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.max(0, Math.round((day(new Date(iso)) - day(now)) / 86_400_000));
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(days, "day");
}

/** When an item is reviewed next, short: "today", "tomorrow", a weekday this week, else the date. */
export function reviewDay(iso: string, now: Date, locale: Locale = "en"): string {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const due = new Date(iso);
  const days = Math.round((day(due) - day(now)) / 86_400_000);
  if (days <= 1) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.max(0, days), "day");
  if (days < 7) return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(due);
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(due);
}

/** Whether a review item is due by the end of today, by calendar day. */
export function isDue(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return day(new Date(iso)) <= day(now);
}
