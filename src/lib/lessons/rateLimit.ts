import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Rate limiting backed by a COUNT query against the tables that already
 * exist — durable and correct across multiple server instances, unlike
 * an in-memory counter, and without adding any new infrastructure
 * (Redis, etc.). Identity is always the authenticated user's id, passed
 * in by the caller from verifySession() — never a client-supplied
 * identifier.
 *
 * These thresholds are deliberately conservative defaults, not a
 * pricing/subscription model — Phase 12/13 (subscriptions, voice cost
 * controls) can layer stricter, plan-aware limits on top of this same
 * mechanism later without changing its shape.
 */
const MAX_NEW_SESSIONS_PER_HOUR = 5;
const MAX_MESSAGES_PER_5_MINUTES = 20;

export interface RateLimitResult {
  allowed: boolean;
}

export async function checkStartLessonRateLimit(userId: string): Promise<RateLimitResult> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("lesson_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);

  if (error) {
    console.error(error);
    // Fail closed: if we can't verify the rate limit, don't allow the
    // (cost-bearing) action through.
    return { allowed: false };
  }

  return { allowed: (count ?? 0) < MAX_NEW_SESSIONS_PER_HOUR };
}

export async function checkLessonMessageRateLimit(userId: string): Promise<RateLimitResult> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("lesson_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "learner")
    .gte("created_at", since);

  if (error) {
    console.error(error);
    return { allowed: false };
  }

  return { allowed: (count ?? 0) < MAX_MESSAGES_PER_5_MINUTES };
}
