import "server-only";

import { cache } from "react";
import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { AssessmentSkill, CefrAssessmentStatus } from "./constants";

export interface UserLanguageLevels {
  /** Legacy placement v1 result — an ESTIMATE, never a confirmation. */
  currentCefrLevel: string | null;
  confirmedCefrLevel: string | null;
  learningCefrLevel: string | null;
  assessmentStatus: CefrAssessmentStatus;
}

/** Reads the confirmed/learning/legacy level trio for one target language,
 * scoped to the caller via the ordinary RLS-scoped client. */
export const getUserLanguageLevels = cache(
  async (targetLanguageCode: string): Promise<UserLanguageLevels | null> => {
    const { user } = await verifySession();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("user_languages")
      .select("current_cefr_level, confirmed_cefr_level, learning_cefr_level, assessment_status")
      .eq("user_id", user.id)
      .eq("target_language_code", targetLanguageCode)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      currentCefrLevel: data.current_cefr_level,
      confirmedCefrLevel: data.confirmed_cefr_level,
      learningCefrLevel: data.learning_cefr_level,
      assessmentStatus: data.assessment_status as CefrAssessmentStatus,
    };
  },
);

export interface CefrSkillStateRecord {
  skill: AssessmentSkill;
  status: CefrAssessmentStatus;
  estimatedLevel: string | null;
  confirmedLevel: string | null;
  updatedAt: string;
}

/** The learner's per-skill CEFR profile for one target language — the
 * "Skill Profile" (AGENTS.md Section 3). Skills with no row at all are
 * simply not represented; callers must show those as "Not assessed yet",
 * never invent a row for them. */
export const getCefrSkillProfile = cache(
  async (targetLanguageCode: string): Promise<CefrSkillStateRecord[]> => {
    const { user } = await verifySession();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("cefr_skill_states")
      .select("skill, status, estimated_level, confirmed_level, updated_at")
      .eq("user_id", user.id)
      .eq("target_language_code", targetLanguageCode);

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      skill: row.skill as AssessmentSkill,
      status: row.status as CefrAssessmentStatus,
      estimatedLevel: row.estimated_level,
      confirmedLevel: row.confirmed_level,
      updatedAt: row.updated_at,
    }));
  },
);

export interface LanguageAssessmentSummary {
  id: string;
  assessmentType: string;
  status: string;
  sourceCefrLevel: string | null;
  targetCefrLevel: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

/** The caller's assessment history for one target language, most recent
 * first — immutable, real historical evidence, never rewritten. */
export const getAssessmentHistory = cache(
  async (targetLanguageCode: string): Promise<LanguageAssessmentSummary[]> => {
    const { user } = await verifySession();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("language_assessments")
      .select("id, assessment_type, status, source_cefr_level, target_cefr_level, started_at, completed_at")
      .eq("user_id", user.id)
      .eq("target_language_code", targetLanguageCode)
      .order("created_at", { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      id: row.id,
      assessmentType: row.assessment_type,
      status: row.status,
      sourceCefrLevel: row.source_cefr_level,
      targetCefrLevel: row.target_cefr_level,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    }));
  },
);

/** The caller's currently in-progress assessment for one target language,
 * if any — used to offer "Continue assessment" rather than starting a
 * second, redundant one. */
export const getActiveAssessment = cache(
  async (targetLanguageCode: string): Promise<LanguageAssessmentSummary | null> => {
    const { user } = await verifySession();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("language_assessments")
      .select("id, assessment_type, status, source_cefr_level, target_cefr_level, started_at, completed_at")
      .eq("user_id", user.id)
      .eq("target_language_code", targetLanguageCode)
      .eq("status", "in_progress")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      assessmentType: data.assessment_type,
      status: data.status,
      sourceCefrLevel: data.source_cefr_level,
      targetCefrLevel: data.target_cefr_level,
      startedAt: data.started_at,
      completedAt: data.completed_at,
    };
  },
);

export interface BridgePlanSummary {
  id: string;
  sourceLevel: string;
  targetLevel: string;
  status: string;
  targets: Array<{ skill: AssessmentSkill; gapDescription: string; status: string }>;
}

/** The caller's bridge plans for one target language. Empty when none
 * exist — never fabricated ("study more" placeholders). */
export const getBridgePlans = cache(async (targetLanguageCode: string): Promise<BridgePlanSummary[]> => {
  const { user } = await verifySession();
  const supabase = await createClient();

  const { data: plans, error } = await supabase
    .from("bridge_plans")
    .select("id, source_level, target_level, status")
    .eq("user_id", user.id)
    .eq("target_language_code", targetLanguageCode)
    .order("created_at", { ascending: false });

  if (error || !plans || plans.length === 0) {
    return [];
  }

  const { data: targets } = await supabase
    .from("bridge_plan_targets")
    .select("bridge_plan_id, skill, gap_description, status")
    .in(
      "bridge_plan_id",
      plans.map((p) => p.id),
    );

  const targetsByPlan = new Map<string, BridgePlanSummary["targets"]>();
  for (const target of targets ?? []) {
    const list = targetsByPlan.get(target.bridge_plan_id) ?? [];
    list.push({ skill: target.skill as AssessmentSkill, gapDescription: target.gap_description, status: target.status });
    targetsByPlan.set(target.bridge_plan_id, list);
  }

  return plans.map((plan) => ({
    id: plan.id,
    sourceLevel: plan.source_level,
    targetLevel: plan.target_level,
    status: plan.status,
    targets: targetsByPlan.get(plan.id) ?? [],
  }));
});
