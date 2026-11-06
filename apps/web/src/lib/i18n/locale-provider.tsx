import { type ReactNode, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, isLocale, type Locale, LOCALE_STORAGE_KEY, LocaleContext } from "./locale";

function readSaved(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(saved) ? saved : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE; // storage blocked: fall back without failing
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(readSaved);

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

