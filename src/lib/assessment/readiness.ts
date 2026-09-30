import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getActivePolicy } from "./policy";

/**
 * A deterministic aggregation of REAL Language Brain evidence — facts,
 * never a verdict. AGENTS.md: "Language Brain may produce readiness
 * evidence / readiness pending but not confirmed level promotion." This
 * is exactly that evidence, nothing more.
 */
export interface ReadinessEvidenceSnapshot {
  grammarScore: number | null;
  grammarEvidenceCount: number;
  dueReviewCount: number;
  recurringErrorCount: number;
  lessonsIngestedCount: number;
  lastIngestedLessonAt: string | null;
  computedAt: string;
}

export async function computeReadinessEvidenceSnapshot(
  userId: string,
  targetLanguageCode: string,
): Promise<ReadinessEvidenceSnapshot> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [profileResult, grammarSkillResult, dueReviewCountResult, recurringErrorCountResult] = await Promise.all([
    supabase
      .from("language_brain_profiles")
      .select("lessons_ingested_count, last_ingested_lesson_at")
      .eq("user_id", userId)
      .eq("target_language_code", targetLanguageCode)
      .maybeSingle(),
    supabase
      .from("language_brain_skill_states")
      .select("score, evidence_count")
      .eq("user_id", userId)
      .eq("target_language_code", targetLanguageCode)
      .eq("skill", "grammar")
      .maybeSingle(),
    supabase
      .from("language_brain_review_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("target_language_code", targetLanguageCode)
      .eq("status", "pending")
      .lte("due_at", nowIso),
    supabase
      .from("language_brain_error_patterns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("target_language_code", targetLanguageCode)
      .eq("is_recurring", true)
      .eq("status", "active"),
  ]);

  return {
    grammarScore: grammarSkillResult.data?.score ?? null,
    grammarEvidenceCount: grammarSkillResult.data?.evidence_count ?? 0,
    dueReviewCount: dueReviewCountResult.count ?? 0,
    recurringErrorCount: recurringErrorCountResult.count ?? 0,
    lessonsIngestedCount: profileResult.data?.lessons_ingested_count ?? 0,
    lastIngestedLessonAt: profileResult.data?.last_ingested_lesson_at ?? null,
    computedAt: nowIso,
  };
}

/**
 * Persists a fresh readiness snapshot for one (user, target language,
 * candidate level). `status` is ALWAYS 'readiness_pending' — there is no
 * active 'readiness' policy (see policy.ts), so no code path here is
 * capable of writing 'ready' / 'almost_ready' / 'not_ready_yet', even
 * though those values are allowed by the database CHECK for when a real
 * policy eventually exists. Writes via service_role: level_readiness_states
 * grants no insert/update to authenticated (0007_cefr_assessment_v2.sql)
 * — this is derived state, never browser-writable.
 */
export async function recordReadinessSnapshot(
  userId: string,
  targetLanguageCode: string,
  candidateTargetLevel: string,
): Promise<void> {
  const snapshot = await computeReadinessEvidenceSnapshot(userId, targetLanguageCode);
  const policy = await getActivePolicy("readiness");

  const supabase = createServiceRoleClient();
  await supabase.from("level_readiness_states").upsert(
    {
      user_id: userId,
      target_language_code: targetLanguageCode,
      candidate_target_level: candidateTargetLevel,
      // Deliberately hardcoded, not derived from `policy` above: even
      // once a 'readiness' policy exists, this phase does not implement
      // the decision algorithm that would turn evidence + policy into a
      // ready/almost_ready/not_ready_yet verdict (AGENTS.md Section 22
      // asks only for the evidence aggregation architecture, not that
      // algorithm). `policy` is still resolved and stored below so the
      // row is traceable to whichever policy existed at computation time.
      status: "readiness_pending",
      evidence_snapshot: snapshot,
      policy_version_id: policy?.id ?? null,
      computed_at: snapshot.computedAt,
    },
    { onConflict: "user_id,target_language_code,candidate_target_level" },
  );
}
