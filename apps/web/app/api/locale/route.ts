import { NextResponse } from "next/server";

import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { locale?: string } | null;
  const locale = normalizeLocale(body?.locale);
  const response = NextResponse.json({ ok: true, locale });

  response.cookies.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });

  return response;
}
