import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The assessment policy registry (AGENTS.md Section 20; see
 * 0007_cefr_assessment_v2.sql's assessment_policy_versions table). This
 * module is the ONLY place code asks "is there an active policy for X" —
 * every caller that needs to gate a promotion/confirmation/readiness
 * decision goes through here, never by hardcoding a threshold locally.
 *
 * There is deliberately no active row in assessment_policy_versions yet
 * for any area — see AGENTS.md for the full list of undecided
 * thresholds (minimum evidence volume, minimum skill score, required-skill
 * counts, readiness boundaries, reassessment interval, bridge-plan
 * completion criteria). getActivePolicy() below will therefore always
 * resolve to `null` today. That is not a bug to "fix" by inventing
 * numbers — it is the fail-closed behavior this architecture exists to
 * guarantee. When a real policy is ready, a human authors and activates a
 * row directly (SQL, or a future admin tool) — no code change is needed
 * here for the policy to start taking effect once it's read as `rules`.
 */

/** Known policy areas. New areas can be added here without a migration —
 * assessment_policy_versions.policy_area has no database CHECK. */
export const POLICY_AREAS = [
  "level_confirmation",
  "readiness",
  "bridge_plan_completion",
  "reassessment_interval",
] as const;
export type PolicyArea = (typeof POLICY_AREAS)[number];

/**
 * The SHAPE a future level_confirmation policy would have. Documented
 * here so the eventual policy author has a concrete target, and so
 * calling code can be written and TESTED against this shape today even
 * though no policy row exists to populate it yet. Nothing in this file
 * or elsewhere constructs one of these from invented numbers.
 */
export interface LevelConfirmationPolicyRules {
  /** Minimum number of assessment responses required, per required skill,
   * before that skill's evidence counts toward confirmation. */
  minimumItemsPerSkill: number;
  /** Minimum raw_score (0-100) a required skill must reach. */
  minimumSkillScore: number;
  /** Which skills must individually clear minimumSkillScore for the
   * overall level to be confirmable — deliberately NOT "confirm from an
   * average of all skills" (AGENTS.md's "no simple average" rule). */
  requiredSkills: string[];
}

export interface AssessmentPolicy<TRules = unknown> {
  id: string;
  policyArea: PolicyArea;
  versionLabel: string;
  rules: TRules;
  activatedAt: string | null;
}

/**
 * Returns the single ACTIVE policy for a given area, or `null` if none is
 * active. Reads via the ordinary RLS-scoped client — policy definitions
 * are non-sensitive product configuration (AGENTS.md), safe for any
 * authenticated caller, and the table is expected to be empty or nearly
 * so. A `null` return is the ONLY value that means "no legitimate
 * decision can be made yet" — callers must treat it as fail-closed, never
 * substitute a guessed policy.
 */
export async function getActivePolicy<TRules = unknown>(
  policyArea: PolicyArea,
): Promise<AssessmentPolicy<TRules> | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("assessment_policy_versions")
    .select("id, policy_area, version_label, rules, activated_at")
    .eq("policy_area", policyArea)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    policyArea: data.policy_area as PolicyArea,
    versionLabel: data.version_label,
    rules: data.rules as TRules,
    activatedAt: data.activated_at,
  };
}

/**
 * Convenience wrapper for the specific, most consequential gate: is there
 * an active level_confirmation policy right now? Every code path that
 * might otherwise be tempted to promote a confirmed CEFR level must call
 * this (or getActivePolicy directly) and do nothing but record
 * 'readiness_pending' / leave status as 'estimated' when it returns
 * false — see src/lib/assessment/submit.ts and readiness.ts.
 */
export async function hasActiveLevelConfirmationPolicy(): Promise<boolean> {
  const policy = await getActivePolicy<LevelConfirmationPolicyRules>("level_confirmation");
  return policy !== null;
}
