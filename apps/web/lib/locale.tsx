"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_LOCALE, getMessages, type Locale, type Messages } from "@whosin/shared";

interface LocaleCtx {
  locale: Locale;
  t: Messages;
  setLocale: (l: Locale) => void;
  toggle: () => void;
}

const Ctx = createContext<LocaleCtx | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const saved = (typeof window !== "undefined" &&
      window.localStorage.getItem("wi.locale")) as Locale | null;
    if (saved === "fr" || saved === "en") setLocaleState(saved);
    else if (typeof navigator !== "undefined" && navigator.language.startsWith("en"))
      setLocaleState("en");
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") window.localStorage.setItem("wi.locale", l);
  };

  const value = useMemo<LocaleCtx>(
    () => ({
      locale,
      t: getMessages(locale),
      setLocale,
      toggle: () => setLocale(locale === "fr" ? "en" : "fr"),
    }),
    [locale]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): LocaleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useT must be used within LocaleProvider");
  return ctx;
}
