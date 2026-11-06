import { type MistakeStatus, NEW_WORD_CATEGORY } from "@/lib/api";
import type { Copy, Locale } from "@/lib/i18n/locale";

/** Filter tabs name a group of mistakes. */
export const STATUS_LABEL: Copy<Record<MistakeStatus, string>> = {
  en: { open: "Open", improving: "Improving", mastered: "Mastered" },
  "pt-BR": { open: "Abertos", improving: "Melhorando", mastered: "Dominados" },
};

/** The chip on one mistake. */
export const STATUS_CHIP_LABEL: Copy<Record<MistakeStatus, string>> = {
  en: STATUS_LABEL.en,
  "pt-BR": { open: "Aberto", improving: "Melhorando", mastered: "Dominado" },
};

/** "today", "yesterday" or "3 days ago", by calendar day. */
export function seenAgo(iso: string, now: Date, locale: Locale = "en"): string {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.max(0, Math.round((day(now) - day(new Date(iso))) / 86_400_000));
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-days, "day");
}

const CATEGORY_PT: Record<string, string> = {
  grammar: "Gramática",
  vocabulary: "Vocabulário",
  word_choice: "Escolha de palavra",
  pronunciation: "Pronúncia",
  [NEW_WORD_CATEGORY]: "Palavra nova",
};

/** "grammar" → "Grammar" ("Gramática" in Portuguese). Unknown categories stay as the tutor named them. */
export function categoryLabel(category: string, locale: Locale = "en"): string {
  if (locale === "pt-BR" && CATEGORY_PT[category]) return CATEGORY_PT[category];
  return category.charAt(0).toUpperCase() + category.slice(1).replaceAll("_", " ");
}

/** The learner's own words: struck through for a mistake; plain, in their first language, for a new word. */
export function originalProps(category: string): { lang: string; className: string } {
  return category === NEW_WORD_CATEGORY
    ? { lang: "pt-BR", className: "text-[15px] text-taupe" }
    : { lang: "en", className: "text-[15px] text-taupe line-through" };
}
