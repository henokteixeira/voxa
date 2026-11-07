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

const CATEGORY_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    verb_tense: "Verb tense",
    agreement: "Agreement",
    sentence_structure: "Sentence structure",
    articles_prepositions: "Articles and prepositions",
    word_choice: "Word choice",
    expression: "Natural expression",
    pronunciation: "Pronunciation",
    [NEW_WORD_CATEGORY]: "New word",
  },
  "pt-BR": {
    verb_tense: "Tempo verbal",
    agreement: "Concordância",
    sentence_structure: "Estrutura da frase",
    articles_prepositions: "Artigos e preposições",
    word_choice: "Escolha de palavra",
    expression: "Expressão natural",
    pronunciation: "Pronúncia",
    grammar: "Gramática",
    vocabulary: "Vocabulário",
    [NEW_WORD_CATEGORY]: "Palavra nova",
  },
};

/** "verb_tense" → "Verb tense" ("Tempo verbal" in Portuguese). Other categories stay as the tutor named them. */
export function categoryLabel(category: string, locale: Locale = "en"): string {
  const known = CATEGORY_LABELS[locale][category];
  if (known) return known;
  return category.charAt(0).toUpperCase() + category.slice(1).replaceAll("_", " ");
}

/** The learner's own words: struck through for a mistake; plain, in their first language, for a new word. */
export function originalProps(category: string): { lang: string; className: string } {
  return category === NEW_WORD_CATEGORY
    ? { lang: "pt-BR", className: "text-[15px] text-taupe" }
    : { lang: "en", className: "text-[15px] text-taupe line-through" };
}
