"use client";

import { useCallback, useEffect, useState } from "react";
import fr from "./translations/fr";
import en from "./translations/en";
import es from "./translations/es";
import it from "./translations/it";
import pt from "./translations/pt";
import zh from "./translations/zh";
import ko from "./translations/ko";

export type Locale = "fr" | "en" | "es" | "it" | "pt" | "zh" | "ko";

const dictionaries: Record<Locale, Record<string, string>> = { fr, en, es, it, pt, zh, ko };

const COOKIE_NAME = "locale";
const DEFAULT_LOCALE: Locale = "fr";

/**
 * Read the current locale from the `locale` cookie (client-side).
 * Falls back to browser language detection, then to "fr".
 */
export function getLocale(): Locale {
  if (typeof document !== "undefined") {
    const match = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${COOKIE_NAME}=`));
    const val = match?.split("=")[1];
    if (val && val in dictionaries) return val as Locale;
  }

  if (typeof navigator !== "undefined") {
    const lang = navigator.language?.slice(0, 2).toLowerCase();
    if (lang && lang in dictionaries) return lang as Locale;
  }

  return DEFAULT_LOCALE;
}

/**
 * Translate a key for a given locale.
 * Returns the key itself if no translation is found (graceful fallback).
 */
export function t(key: string, locale?: Locale, vars?: Record<string, string>): string {
  const loc = locale || getLocale();
  let result = dictionaries[loc]?.[key] || dictionaries[DEFAULT_LOCALE]?.[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      result = result.replace(`{${k}}`, v);
    }
  }
  return result;
}

/**
 * Set locale preference in a cookie (client-side).
 */
export function setLocale(locale: Locale): void {
  document.cookie = `${COOKIE_NAME}=${locale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
  // Also notify the server
  fetch("/api/locale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale }),
  }).catch(() => {});
}

/**
 * React hook for i18n in client components.
 * Returns the current locale, a translate function, and a setter.
 */
export function useTranslation() {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(getLocale());
  }, []);

  const translate = useCallback(
    (key: string, vars?: Record<string, string>) => t(key, locale, vars),
    [locale]
  );

  const changeLocale = useCallback((newLocale: Locale) => {
    setLocale(newLocale);
    setLocaleState(newLocale);
    // Update the html lang attribute
    document.documentElement.lang = newLocale;
  }, []);

  return { locale, t: translate, setLocale: changeLocale };
}
