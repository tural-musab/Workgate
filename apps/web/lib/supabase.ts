import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import { getAppEnv } from "./env";

export function isSupabaseConfigured() {
  const env = getAppEnv();
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export async function createSupabaseServerClient() {
  const env = getAppEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error("Supabase auth is not configured.");
  }

  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }>) {
        for (const cookie of cookiesToSet) {
          if (cookie.options) {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          } else {
            cookieStore.set(cookie.name, cookie.value);
          }
        }
      }
    }
  });
}

export function isSupabaseStorageConfigured() {
  const env = getAppEnv();
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey && env.supabaseStorageBucket);
}

export function createSupabaseAdminClient() {
  const env = getAppEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("Supabase storage is not configured.");
  }

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
