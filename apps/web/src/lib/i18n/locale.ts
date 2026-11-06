import { createContext, useContext } from "react";

/** Languages the interface is written in. The conversation itself stays in the language being learned. */
export const LOCALES = ["pt-BR", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Inside the app, the interface starts in the learner's first language: no effort to read the instructions. */
export const DEFAULT_LOCALE: Locale = "pt-BR";
export const LOCALE_STORAGE_KEY = "voxa.locale";

/** A piece of copy written once per interface language. */
export type Copy<T> = Record<Locale, T>;

export interface LocaleValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

// Without a provider (tests, isolated components) the copy is English, so assertions stay stable.
export const LocaleContext = createContext<LocaleValue>({ locale: "en", setLocale: () => {} });

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

export function useLocale(): LocaleValue {
  return useContext(LocaleContext);
}

/** Picks the current language's version of a copy object. */
export function useCopy<T>(copy: Copy<T>): T {
  return copy[useLocale().locale];
}
