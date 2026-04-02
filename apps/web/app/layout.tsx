import type { Metadata } from "next";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";

import { LocaleProvider } from "@/components/locale-provider";
import { getMessages } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-sans"
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "AI TeamS",
  description: "Operator dashboard for an AI software office."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getServerLocale();
  const messages = getMessages(locale);

  return (
    <html lang={locale} className={`${publicSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body className="font-[var(--font-sans)]" suppressHydrationWarning>
        <LocaleProvider locale={locale} messages={messages}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
