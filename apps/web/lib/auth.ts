import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAppEnv } from "./env";

const SESSION_COOKIE = "aiteams_session";

async function getJwtSecret() {
  return new TextEncoder().encode(getAppEnv().authSecret);
}

export async function createSession(username: string) {
  const token = await new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(await getJwtSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = await jwtVerify(token, await getJwtSecret());
    return { username: String(payload.payload.username ?? "") };
  } catch {
    return null;
  }
}

export async function requirePageSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

