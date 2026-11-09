import type { CheckInPace } from "@/lib/api";
import { useLocale } from "@/lib/i18n/locale";

/** Formats a check-in's date for its labels, e.g. "Nov 9". */
export function useCheckInDate() {
  const { locale } = useLocale();
  return (iso: string) => new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

/** The clearest gain since the last check-in: pace first, then fewer long pauses; null when neither got better. */
export function clearestGain(now: CheckInPace, before: CheckInPace) {
  if (now.wordsPerMinute !== null && before.wordsPerMinute !== null && now.wordsPerMinute > before.wordsPerMinute) {
    return { kind: "pace" as const, before: before.wordsPerMinute, now: now.wordsPerMinute };
  }
  if (now.longPauses < before.longPauses) return { kind: "pauses" as const, before: before.longPauses, now: now.longPauses };
  return null;
}
