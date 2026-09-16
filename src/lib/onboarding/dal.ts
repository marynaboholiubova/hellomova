import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/constants/routes";
import { PlacementCategoryResultsSchema } from "@/lib/onboarding/schemas";
import type { PlacementCategoryResult } from "@/lib/placement/scoring";

export const ONBOARDING_STEPS = [
  "native-language",
  "target-language",
  "goal",
  "placement-test",
  "result",
  "personal-plan",
  "teacher",
  "completed",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const STEP_ROUTES: Record<OnboardingStep, string> = {
  "native-language": ROUTES.onboardingNativeLanguage,
  "target-language": ROUTES.onboardingTargetLanguage,
  goal: ROUTES.onboardingGoal,
  "placement-test": ROUTES.onboardingPlacementTest,
  result: ROUTES.onboardingResult,
  "personal-plan": ROUTES.onboardingPersonalPlan,
  teacher: ROUTES.onboardingTeacher,
  completed: ROUTES.dashboard,
};

export function onboardingRouteFor(step: OnboardingStep): string {
  return STEP_ROUTES[step];
}

function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

function isOnboardingStep(value: string): value is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value);
}

export interface OnboardingProfile {
  id: string;
  displayName: string | null;
  nativeLanguageCode: string | null;
  learningGoal: string | null;
  selectedTeacherId: string | null;
  onboardingStep: OnboardingStep;
  onboardingCompletedAt: string | null;
}

/**
 * Loads the caller's profile. Identity always comes from `verifySession()`
 * — never from a client-supplied id — so this can only ever read the
 * caller's own row; RLS backs that up at the database layer too. The row
 * itself is created by the Phase 1 `handle_new_user` trigger at sign-up, so
 * this only reads, it never inserts.
 */
export const getOnboardingProfile = cache(async (): Promise<OnboardingProfile> => {
  const { user } = await verifySession();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, native_language_code, learning_goal, selected_teacher_id, onboarding_step, onboarding_completed_at",
    )
    .eq("id", user.id)
    .single();

  if (error || !data) {
    console.error(error ?? new Error("Profile row missing for authenticated user"));
    redirect(ROUTES.login);
  }

  const onboardingStep = isOnboardingStep(data.onboarding_step)
    ? data.onboarding_step
    : "native-language";

  return {
    id: data.id,
    displayName: data.display_name,
    nativeLanguageCode: data.native_language_code,
    learningGoal: data.learning_goal,
    selectedTeacherId: data.selected_teacher_id,
    onboardingStep,
    onboardingCompletedAt: data.onboarding_completed_at,
  };
});

/**
 * The real authorization boundary for a single onboarding page: verifies
 * auth, loads the profile, and redirects if the caller shouldn't be on
 * this step right now. Call this at the top of every onboarding page —
 * a parent layout's check does not protect sibling pages under it.
 */
export async function requireOnboardingStep(
  step: OnboardingStep,
): Promise<OnboardingProfile> {
  const profile = await getOnboardingProfile();

  if (profile.onboardingCompletedAt) {
    redirect(ROUTES.dashboard);
  }

  if (stepIndex(step) > stepIndex(profile.onboardingStep)) {
    redirect(onboardingRouteFor(profile.onboardingStep));
  }

  return profile;
}

export interface PrimaryUserLanguage {
  targetLanguageCode: string;
  currentCefrLevel: string | null;
}

/** Reads the caller's primary target language row, if one exists yet. */
export const getPrimaryUserLanguage = cache(
  async (): Promise<PrimaryUserLanguage | null> => {
    const { user } = await verifySession();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("user_languages")
      .select("target_language_code, current_cefr_level")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle();

    if (error) {
      console.error(error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      targetLanguageCode: data.target_language_code,
      currentCefrLevel: data.current_cefr_level,
    };
  },
);

export interface LatestPlacementAttempt {
  targetLanguageCode: string;
  score: number;
  totalQuestions: number;
  estimatedLevel: string;
  categoryResults: PlacementCategoryResult[];
  /** Which bank/version actually produced this result — see getPlacementBankVersion(). */
  testVersion: string;
}

/** Reads the caller's most recent placement test attempt, if any. */
export const getLatestPlacementAttempt = cache(
  async (): Promise<LatestPlacementAttempt | null> => {
    const { user } = await verifySession();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("placement_test_attempts")
      .select(
        "target_language_code, score, total_questions, estimated_level, category_breakdown, test_version",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(error);
      return null;
    }

    if (!data) {
      return null;
    }

    const categoryResults = PlacementCategoryResultsSchema.safeParse(data.category_breakdown);

    return {
      targetLanguageCode: data.target_language_code,
      score: data.score,
      totalQuestions: data.total_questions,
      estimatedLevel: data.estimated_level,
      categoryResults: categoryResults.success ? categoryResults.data : [],
      testVersion: data.test_version,
    };
  },
);
