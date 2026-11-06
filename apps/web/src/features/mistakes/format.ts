import type { MistakeStatus } from "@/lib/api";

export const STATUS_LABEL: Record<MistakeStatus, string> = {
  open: "Open",
  improving: "Improving",
  mastered: "Mastered",
};

/** "today", "yesterday" or "3 days ago", by calendar day. */
export function seenAgo(iso: string, now: Date): string {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.max(0, Math.round((day(now) - day(new Date(iso))) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** "grammar" → "Grammar". */
export function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1).replaceAll("_", " ");
}
