import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * A privileged Supabase client that bypasses Row Level Security.
 *
 * `lesson_sessions`/`lesson_messages` intentionally grant NO insert/update
 * to `authenticated`/`anon` (see 0005_ai_lesson_engine.sql) — an
 * authenticated browser cannot write to either table under any
 * circumstances, no matter what it sends, because the ordinary
 * publishable-key client (src/lib/supabase/server.ts) authenticates as
 * the same `authenticated` role a browser session already holds. This
 * client is how the lesson engine's own Server Actions still write: it
 * authenticates as `service_role`, a distinct credential the browser can
 * never obtain, which bypasses RLS entirely.
 *
 * Because RLS no longer backstops these writes, the CALLER is the only
 * remaining enforcement of "a user may only write their own data" —
 * every call site must derive `user_id` from a server-verified session
 * (`verifySession()` / `getOnboardingProfile()` / `getOwnedLessonSession()`),
 * never from client input. Do not import this outside
 * src/features/lessons/actions.ts without the same review that produced
 * this trust boundary — see AGENTS.md's "AI lesson engine" section.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
