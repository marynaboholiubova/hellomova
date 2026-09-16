"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireOnboardingStep } from "@/lib/onboarding/dal";
import { ROUTES } from "@/constants/routes";
import { GENERIC_ERROR_MESSAGE, toSafeErrorMessage } from "@/lib/utils/errors";
import {
  CefrLevelSchema,
  GoalCodeSchema,
  LanguageCodeSchema,
  TeacherIdSchema,
  buildPlacementAnswersSchema,
} from "@/lib/onboarding/schemas";
import { getPlacementBank, getPlacementBankVersion } from "@/lib/placement/questions";
import { scorePlacementTest } from "@/lib/placement/scoring";
import type { OnboardingFormState } from "./types";

/**
 * Every action below calls requireOnboardingStep(step) for its own step
 * rather than a bare session check. Server Actions are directly POST-able
 * endpoints regardless of which page rendered them, so this is what
 * actually prevents a caller from skipping ahead by invoking a later
 * step's action out of order — not just the page-level redirect.
 */

export async function saveNativeLanguageAction(
  _state: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const validated = LanguageCodeSchema.safeParse(formData.get("nativeLanguageCode"));

  if (!validated.success) {
    return { error: "Please choose a language." };
  }

  const profile = await requireOnboardingStep("native-language");
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      native_language_code: validated.data,
      onboarding_step: "target-language",
    })
    .eq("id", profile.id);

  if (error) {
    return { error: toSafeErrorMessage(error, GENERIC_ERROR_MESSAGE) };
  }

  redirect(ROUTES.onboardingTargetLanguage);
}

export async function saveTargetLanguageAction(
  _state: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const validated = LanguageCodeSchema.safeParse(formData.get("targetLanguageCode"));

  if (!validated.success) {
    return { error: "Please choose a language." };
  }

  const profile = await requireOnboardingStep("target-language");
  const supabase = await createClient();

  // Only one target language can be primary right now (Phase 2 supports a
  // single active target language). Demote any other rows first, then
  // upsert this one as primary — the unique(user_id, target_language_code)
  // constraint prevents duplicate rows for the same user+language, and
  // leaving other rows in place (rather than deleting) is what lets a
  // later "My languages" screen add more without losing this one.
  const { error: demoteError } = await supabase
    .from("user_languages")
    .update({ is_primary: false })
    .eq("user_id", profile.id)
    .neq("target_language_code", validated.data);

  if (demoteError) {
    return { error: toSafeErrorMessage(demoteError, GENERIC_ERROR_MESSAGE) };
  }

  const { error: upsertError } = await supabase.from("user_languages").upsert(
    {
      user_id: profile.id,
      target_language_code: validated.data,
      is_primary: true,
    },
    { onConflict: "user_id,target_language_code" },
  );

  if (upsertError) {
    return { error: toSafeErrorMessage(upsertError, GENERIC_ERROR_MESSAGE) };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ onboarding_step: "goal" })
    .eq("id", profile.id);

  if (profileError) {
    return { error: toSafeErrorMessage(profileError, GENERIC_ERROR_MESSAGE) };
  }

  redirect(ROUTES.onboardingGoal);
}

export async function saveGoalAction(
  _state: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const validated = GoalCodeSchema.safeParse(formData.get("goalCode"));

  if (!validated.success) {
    return { error: "Please choose a goal." };
  }

  const profile = await requireOnboardingStep("goal");
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      learning_goal: validated.data,
      onboarding_step: "placement-test",
    })
    .eq("id", profile.id);

  if (error) {
    return { error: toSafeErrorMessage(error, GENERIC_ERROR_MESSAGE) };
  }

  redirect(ROUTES.onboardingPlacementTest);
}

/** Used only after a real placement test has actually been scored. */
async function advanceToResultWithLevel(
  profileId: string,
  targetLanguageCode: string,
  cefrLevel: string,
): Promise<OnboardingFormState> {
  const supabase = await createClient();

  const { error: languageUpdateError } = await supabase
    .from("user_languages")
    .update({ current_cefr_level: cefrLevel })
    .eq("user_id", profileId)
    .eq("target_language_code", targetLanguageCode);

  if (languageUpdateError) {
    return { error: toSafeErrorMessage(languageUpdateError, GENERIC_ERROR_MESSAGE) };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ onboarding_step: "result" })
    .eq("id", profileId);

  if (profileError) {
    return { error: toSafeErrorMessage(profileError, GENERIC_ERROR_MESSAGE) };
  }

  redirect(ROUTES.onboardingResult);
}

/**
 * Used when no test was (or could be) taken — never sets
 * user_languages.current_cefr_level, which is what keeps the level
 * honestly "not assessed" (null) rather than an invented value. Only
 * advances the onboarding step.
 */
async function advanceToResultUnassessed(profileId: string): Promise<OnboardingFormState> {
  const supabase = await createClient();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ onboarding_step: "result" })
    .eq("id", profileId);

  if (profileError) {
    return { error: toSafeErrorMessage(profileError, GENERIC_ERROR_MESSAGE) };
  }

  redirect(ROUTES.onboardingResult);
}

export async function submitPlacementTestAction(
  _state: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const profile = await requireOnboardingStep("placement-test");
  const supabase = await createClient();

  const { data: primaryLanguage, error: languageError } = await supabase
    .from("user_languages")
    .select("target_language_code")
    .eq("user_id", profile.id)
    .eq("is_primary", true)
    .maybeSingle();

  if (languageError) {
    return { error: toSafeErrorMessage(languageError, GENERIC_ERROR_MESSAGE) };
  }

  if (!primaryLanguage) {
    // Shouldn't happen if step-gating worked, but fail safe rather than
    // scoring a test with no target language to attach the result to.
    redirect(ROUTES.onboardingTargetLanguage);
  }

  // The bank is resolved server-side from the user's actual primary
  // target language — never from anything the client sent — so the test
  // that gets scored is always the one for the language the learner is
  // actually learning.
  const bank = getPlacementBank(primaryLanguage.target_language_code);
  const testVersion = getPlacementBankVersion(primaryLanguage.target_language_code);

  if (!bank || !testVersion) {
    // No CEFR-aligned bank for this target language. Never fall back to a
    // different language's content (the original bug), and never invent
    // a level either — the learner's level stays honestly unassessed.
    return advanceToResultUnassessed(profile.id);
  }

  const answers = bank.map((question) => ({
    questionId: question.id,
    optionId: formData.get(`answer-${question.id}`),
  }));

  const validated = buildPlacementAnswersSchema(bank).safeParse(answers);

  if (!validated.success) {
    return { error: "Please answer every question." };
  }

  const { score, totalQuestions, estimatedLevel, categoryResults } = scorePlacementTest(
    bank,
    validated.data,
  );
  const cefrLevel = CefrLevelSchema.parse(estimatedLevel);

  // test_version is resolved server-side above from the target language,
  // exactly like the bank itself — never accepted from the client — so
  // historical attempts stay interpretable even if the bank is revised
  // later (a differently-scored "en-v2" wouldn't be confused with this).
  const { error: attemptError } = await supabase.from("placement_test_attempts").insert({
    user_id: profile.id,
    target_language_code: primaryLanguage.target_language_code,
    score,
    total_questions: totalQuestions,
    estimated_level: cefrLevel,
    category_breakdown: categoryResults,
    test_version: testVersion,
  });

  if (attemptError) {
    return { error: toSafeErrorMessage(attemptError, GENERIC_ERROR_MESSAGE) };
  }

  return advanceToResultWithLevel(profile.id, primaryLanguage.target_language_code, cefrLevel);
}

/**
 * Used as a bare `<form action={skipPlacementTestAction}>` (no
 * useActionState), so — matching advanceFromResultAction /
 * advancePersonalPlanAction below — it never returns a value on any
 * path: it either redirects (success) or logs and redirects back to the
 * same step (failure), rather than returning an error object nothing
 * would render.
 *
 * This is the path for a target language with no CEFR-aligned bank yet.
 * It never inserts a placement_test_attempts row (no test was taken —
 * there is nothing real to record) and never sets
 * user_languages.current_cefr_level — the learner's level stays honestly
 * null ("not assessed yet"), not an invented A1.
 */
export async function skipPlacementTestAction() {
  const profile = await requireOnboardingStep("placement-test");

  await advanceToResultUnassessed(profile.id);
  // Only reached if advanceToResultUnassessed hit an error instead of
  // redirecting on success.
  redirect(ROUTES.onboardingPlacementTest);
}

export async function advanceFromResultAction() {
  const profile = await requireOnboardingStep("result");
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_step: "personal-plan" })
    .eq("id", profile.id);

  if (error) {
    toSafeErrorMessage(error);
    redirect(ROUTES.onboardingResult);
  }

  redirect(ROUTES.onboardingPersonalPlan);
}

export async function advancePersonalPlanAction() {
  const profile = await requireOnboardingStep("personal-plan");
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_step: "teacher" })
    .eq("id", profile.id);

  if (error) {
    toSafeErrorMessage(error);
    redirect(ROUTES.onboardingPersonalPlan);
  }

  redirect(ROUTES.onboardingTeacher);
}

export async function selectTeacherAction(
  _state: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const validated = TeacherIdSchema.safeParse(formData.get("teacherId"));

  if (!validated.success) {
    return { error: "Please choose a teacher." };
  }

  const profile = await requireOnboardingStep("teacher");
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      selected_teacher_id: validated.data,
      onboarding_step: "completed",
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (error) {
    return { error: toSafeErrorMessage(error, GENERIC_ERROR_MESSAGE) };
  }

  redirect(ROUTES.dashboard);
}
