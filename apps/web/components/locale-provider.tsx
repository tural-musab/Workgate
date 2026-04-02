"use client";

import { createContext, useContext } from "react";

import type { Locale, Messages } from "@/lib/i18n";

const LocaleContext = createContext<{ locale: Locale; messages: Messages } | null>(null);

export function LocaleProvider({
  children,
  locale,
  messages
}: {
  children: React.ReactNode;
  locale: Locale;
  messages: Messages;
}) {
  return <LocaleContext.Provider value={{ locale, messages }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useLocale must be used within LocaleProvider.");
  }
  return value;
}
