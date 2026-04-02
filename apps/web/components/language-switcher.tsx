"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { Locale } from "@/lib/i18n";

import { useLocale } from "./locale-provider";

const languageOptions: Locale[] = ["en", "tr"];

export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, messages } = useLocale();
  const [isPending, startTransition] = useTransition();

  function selectLanguage(nextLocale: Locale) {
    if (nextLocale === locale) return;

    startTransition(async () => {
      await fetch("/api/locale", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ locale: nextLocale })
      });

      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">{isPending ? messages.languageSwitcher.loading : messages.common.language}</span>
      <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
        {languageOptions.map((option) => (
          <button
            key={option}
            type="button"
            disabled={isPending}
            onClick={() => selectLanguage(option)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              option === locale ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {option.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
