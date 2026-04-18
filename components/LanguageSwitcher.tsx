"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation, type Locale } from "@/lib/i18n";

const LANGUAGES: { code: Locale; flag: string; label: string }[] = [
  { code: "fr", flag: "\u{1F1EB}\u{1F1F7}", label: "Français" },
  { code: "en", flag: "\u{1F1EC}\u{1F1E7}", label: "English" },
  { code: "es", flag: "\u{1F1EA}\u{1F1F8}", label: "Español" },
  { code: "it", flag: "\u{1F1EE}\u{1F1F9}", label: "Italiano" },
  { code: "pt", flag: "\u{1F1E7}\u{1F1F7}", label: "Português" },
  { code: "zh", flag: "\u{1F1E8}\u{1F1F3}", label: "中文" },
  { code: "ko", flag: "\u{1F1F0}\u{1F1F7}", label: "한국어" },
];

export default function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find((l) => l.code === locale) || LANGUAGES[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-flex-border/50 bg-flex-panel text-sm transition hover:bg-flex-muted/10"
        aria-label={`Langue: ${current.label}`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="text-base leading-none">{current.flag}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select language"
          className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-xl border border-flex-border bg-flex-card shadow-cinema"
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              role="option"
              aria-selected={lang.code === locale}
              onClick={() => {
                setLocale(lang.code);
                setOpen(false);
                // Force page reload to apply lang changes across server components
                window.location.reload();
              }}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-flex-panel ${
                lang.code === locale
                  ? "font-bold text-flex-accent"
                  : "text-flex-text"
              }`}
            >
              <span className="text-base">{lang.flag}</span>
              <span>{lang.label}</span>
              {lang.code === locale && (
                <span className="ml-auto text-xs text-flex-accent">&#10003;</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
