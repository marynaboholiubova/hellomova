import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * TECHNICAL SAFETY LIMIT, not a product/pricing policy. This exists only
 * to bound per-user provider cost and abuse risk, mirroring
 * src/lib/lessons/rateLimit.ts's DB-backed COUNT approach exactly
 * (durable across server instances, no new infra). It is explicitly NOT:
 * - a Premium/Pro entitlement or plan-aware budget,
 * - Phase 13's voice-cost/subscription-minute accounting system,
 * - a business/pricing decision of any kind.
 * The number below is a single, clearly-named, centralized constant —
 * reviewable/adjustable by an engineer at any time without touching
 * product policy. Each attempt costs two provider calls (transcription +
 * evaluation), slightly more than a lesson turn's one, so this is set
 * lower than the lesson engine's own limit.
 */
export const PRONUNCIATION_MAX_ATTEMPTS_PER_HOUR = 15;

export interface RateLimitResult {
  allowed: boolean;
}

export async function checkPronunciationAttemptRateLimit(userId: string): Promise<RateLimitResult> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("pronunciation_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);

  if (error) {
    console.error(error);
    // Fail closed: if we can't verify the rate limit, don't allow the
    // (cost-bearing) action through.
    return { allowed: false };
  }

  return { allowed: (count ?? 0) < PRONUNCIATION_MAX_ATTEMPTS_PER_HOUR };
}
