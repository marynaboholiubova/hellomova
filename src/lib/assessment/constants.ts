/**
 * CEFR Assessment v2 — shared constants. Kept in sync with
 * 0007_cefr_assessment_v2.sql's comments (which document exactly why each
 * enum below has, or deliberately lacks, a matching database CHECK
 * constraint) — see that migration before changing any of these.
 */

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevelV2 = (typeof CEFR_LEVELS)[number];

/**
 * The six primary skill domains (AGENTS.md Section 4) plus pronunciation,
 * matching language_brain_skill_states' existing vocabulary for
 * consistency across the two systems. Deliberately NOT enforced by a
 * database CHECK constraint (see the migration) so future CEFR-aligned
 * domains (spoken interaction, written interaction, mediation,
 * sociolinguistic competence, pragmatic competence) can be added here
 * without a migration. This is the live gate.
 */
export const ASSESSMENT_SKILLS = [
  "grammar",
  "vocabulary",
  "reading",
  "listening",
  "writing",
  "speaking",
  "pronunciation",
] as const;
export type AssessmentSkill = (typeof ASSESSMENT_SKILLS)[number];

/** Skills this product can genuinely assess today from a text-only
 * medium. Listening/speaking/pronunciation stay here for schema
 * extensibility only — no code path in this phase ever produces evidence
 * for them; see AGENTS.md's partial-assessment section. */
export const ASSESSABLE_SKILLS_TODAY: readonly AssessmentSkill[] = [
  "grammar",
  "vocabulary",
  "reading",
  "writing",
];

export const ASSESSMENT_TYPES = [
  "initial_placement",
  "level_readiness",
  "level_confirmation",
  "reassessment",
] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const ASSESSMENT_STATUSES = [
  "in_progress",
  "submitted",
  "evaluating",
  "completed",
  "failed",
  "abandoned",
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

/** Item content type. No database CHECK (see the migration) — a future
 * real listening/speaking item type can be added without a migration. */
export const ITEM_TYPES = ["multiple_choice", "writing_prompt"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_VERSION_STATUSES = ["draft", "reviewed", "active", "retired"] as const;
export type ItemVersionStatus = (typeof ITEM_VERSION_STATUSES)[number];

/** Section 6's confidence/status model, applied at the per-skill level
 * (cefr_skill_states) and summarized per-language (user_languages.assessment_status). */
export const CEFR_ASSESSMENT_STATUS = ["unassessed", "estimated", "confirmed"] as const;
export type CefrAssessmentStatus = (typeof CEFR_ASSESSMENT_STATUS)[number];

/** Level-readiness outcome classes (AGENTS.md Section 24). Only
 * 'readiness_pending' is ever actually written by any code path in this
 * phase — 'ready'/'almost_ready'/'not_ready_yet' require an ACTIVE
 * 'readiness' policy, which does not exist. Listed here (and allowed by
 * the DB CHECK) purely so the architecture doesn't need a migration once
 * a real policy is activated. */
export const READINESS_STATUSES = ["readiness_pending", "ready", "almost_ready", "not_ready_yet"] as const;
export type ReadinessStatus = (typeof READINESS_STATUSES)[number];

export const BRIDGE_PLAN_STATUSES = ["active", "completed", "abandoned"] as const;
export type BridgePlanStatus = (typeof BRIDGE_PLAN_STATUSES)[number];

export const BRIDGE_PLAN_TARGET_SOURCE_TYPES = [
  "language_brain_error_pattern",
  "language_brain_vocabulary",
  "language_brain_review_item",
  "assessment_skill_result",
] as const;
export type BridgePlanTargetSourceType = (typeof BRIDGE_PLAN_TARGET_SOURCE_TYPES)[number];

/** Mirrors placement v1's PASS_THRESHOLD exactly
 * (src/lib/placement/scoring.ts) — carried forward, not reinvented. A
 * skill is only credited as "estimated at this level" when at least this
 * fraction of that skill's items in the attempt were answered correctly. */
export const SKILL_PASS_THRESHOLD = 2 / 3;

export const EXTRACTION_VERSION = "cefr-v2-a1";
