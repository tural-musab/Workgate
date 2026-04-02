import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createStorageAdapter, type StorageAdapter } from "@workgate/db";
import { SessionSchema, canViewAllTeams, type Session, type SessionTeam } from "@workgate/shared";

import { getAppEnv } from "./env";
import { createSupabaseServerClient, isSupabaseConfigured } from "./supabase";

const SESSION_COOKIE = "workgate_session";
const ACTIVE_TEAM_COOKIE = "workgate_active_team";

declare global {
  var __WORKGATE_AUTH_STORAGE__: StorageAdapter | undefined;
}

function getAuthStorage() {
  if (!globalThis.__WORKGATE_AUTH_STORAGE__) {
    globalThis.__WORKGATE_AUTH_STORAGE__ = createStorageAdapter(getAppEnv().databaseUrl);
  }
  return globalThis.__WORKGATE_AUTH_STORAGE__;
}

async function getJwtSecret() {
  return new TextEncoder().encode(getAppEnv().authSecret);
}

function resolveActiveTeam(teams: SessionTeam[], preferredTeamId?: string | null) {
  if (teams.length === 0) return null;
  if (!preferredTeamId) return teams[0] ?? null;
  return teams.find((team) => team.id === preferredTeamId) ?? teams[0] ?? null;
}

async function readPreferredTeamId() {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_TEAM_COOKIE)?.value ?? null;
}

async function buildSeedAdminSession(username: string): Promise<Session> {
  const storage = getAuthStorage();
  const { workspace } = await storage.ensureBootstrapWorkspace();
  const teams = await storage.listTeams(workspace.id);
  const preferredTeamId = await readPreferredTeamId();
  const sessionTeams: SessionTeam[] = teams.map((team) => ({
    ...team,
    teamRole: "team_reviewer"
  }));
  const activeTeam = resolveActiveTeam(sessionTeams, preferredTeamId);

  return SessionSchema.parse({
    authMode: "seed_admin",
    userId: `seed:${username}`,
    email: null,
    displayName: username,
    workspace,
    workspaceRole: "workspace_owner",
    teams: sessionTeams,
    activeTeamId: activeTeam?.id ?? null,
    activeTeam,
    canViewAllTeams: true
  });
}

async function getSeedSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = await jwtVerify(token, await getJwtSecret());
    const username = String(payload.payload.username ?? "");
    if (!username) return null;
    return buildSeedAdminSession(username);
  } catch {
    return null;
  }
}

async function getSupabaseSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const storage = getAuthStorage();
  const context = await storage.getWorkspaceContextByEmail(user.email);
  if (!context) {
    return null;
  }

  const preferredTeamId = await readPreferredTeamId();
  const activeTeam = resolveActiveTeam(context.teams, preferredTeamId);

  return SessionSchema.parse({
    authMode: "supabase",
    userId: user.id,
    email: user.email,
    displayName: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email),
    workspace: context.workspace,
    workspaceRole: context.member.workspaceRole,
    teams: context.teams,
    activeTeamId: activeTeam?.id ?? null,
    activeTeam,
    canViewAllTeams: canViewAllTeams(context.member.workspaceRole)
  });
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

export async function setActiveTeam(teamId: string | null) {
  const cookieStore = await cookies();
  if (!teamId) {
    cookieStore.delete(ACTIVE_TEAM_COOKIE);
    return;
  }
  cookieStore.set(ACTIVE_TEAM_COOKIE, teamId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(ACTIVE_TEAM_COOKIE);
  if (getAppEnv().authMode === "supabase" && isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      // Ignore logout cleanup failures for best-effort sign out.
    }
  }
}

export async function getSession() {
  const env = getAppEnv();
  if (env.authMode === "supabase") {
    const session = await getSupabaseSession();
    if (session) return session;
  }

  return getSeedSession();
}

export async function requirePageSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
