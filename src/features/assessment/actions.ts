"use server";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getPrimaryUserLanguage } from "@/lib/onboarding/dal";
import {
  AssessmentIdSchema,
  RecordMcqResponseSchema,
  RecordWritingResponseSchema,
} from "@/lib/assessment/schemas";
import { startAssessment, recordAssessmentResponse, submitAssessment } from "@/lib/assessment/submit";
import type { AssessmentType } from "@/lib/assessment/constants";
import { toSafeErrorMessage, GENERIC_ERROR_MESSAGE } from "@/lib/utils/errors";
import type { PublicAssessmentItem } from "@/lib/assessment/schemas";

export type StartAssessmentActionState =
  | { error: string }
  | { success: true; assessmentId: string; items: PublicAssessmentItem[] }
  | undefined;

/**
 * Starts a new CEFR v2 assessment for the caller's own primary target
 * language. Every trusted field (user id, target language) is derived
 * from the server-verified session and the caller's own onboarding
 * profile — never from client input, the same trust boundary the lesson
 * engine and Language Brain already use. The client only ever supplies
 * which assessment TYPE it's requesting (initial_placement today; the
 * others are architecturally supported but have no content to serve yet
 * — see startAssessment's "unavailable" contract).
 */
export async function startAssessmentAction(
  assessmentType: AssessmentType = "initial_placement",
): Promise<StartAssessmentActionState> {
  const { user } = await verifySession();

  const primaryLanguage = await getPrimaryUserLanguage();
  if (!primaryLanguage) {
    return { error: "Please choose a target language first." };
  }

  const result = await startAssessment(
    user.id,
    primaryLanguage.targetLanguageCode,
    assessmentType,
    primaryLanguage.currentCefrLevel,
  );

  if (!result.success) {
    if (result.reason === "unavailable") {
      return {
        error:
          "A CEFR-aligned assessment isn't available for this language yet. We'll let you know as soon as one is ready.",
      };
    }
    return { error: GENERIC_ERROR_MESSAGE };
  }

  return { success: true, assessmentId: result.assessmentId, items: result.items };
}

export type RecordResponseActionState = { error: string } | { success: true } | undefined;

/** Records the learner's answer to one multiple-choice item. Correctness
 * is derived server-side from the item's own answer key — the client
 * only ever supplies which option it picked. */
export async function recordMcqResponseAction(
  _state: RecordResponseActionState,
  formData: FormData,
): Promise<RecordResponseActionState> {
  const { user } = await verifySession();

  const validated = RecordMcqResponseSchema.safeParse({
    responseId: formData.get("responseId"),
    selectedOptionId: formData.get("selectedOptionId"),
  });

  if (!validated.success) {
    return { error: "Invalid response." };
  }

  const applied = await recordAssessmentResponse(user.id, validated.data.responseId, {
    selectedOptionId: validated.data.selectedOptionId,
  });

  if (!applied) {
    return { error: "That response couldn't be recorded. The assessment may have already been submitted." };
  }

  return { success: true };
}

/** Records the learner's answer to one writing item. The written text is
 * untrusted content, never instructions — see
 * src/lib/assessment/writingEvaluation.ts for how evaluation treats it. */
export async function recordWritingResponseAction(
  _state: RecordResponseActionState,
  formData: FormData,
): Promise<RecordResponseActionState> {
  const { user } = await verifySession();

  const validated = RecordWritingResponseSchema.safeParse({
    responseId: formData.get("responseId"),
    writtenResponse: formData.get("writtenResponse"),
  });

  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Invalid response." };
  }

  const applied = await recordAssessmentResponse(user.id, validated.data.responseId, {
    writtenResponse: validated.data.writtenResponse,
  });

  if (!applied) {
    return { error: "That response couldn't be recorded. The assessment may have already been submitted." };
  }

  return { success: true };
}

export type SubmitAssessmentActionState = { error: string } | { success: true } | undefined;

/**
 * Finalizes an assessment. Ownership is verified via a real, RLS-scoped
 * read (a caller can never submit someone else's assessment id) before
 * calling the trusted, idempotent, retry-safe orchestration in
 * src/lib/assessment/submit.ts. The browser cannot influence the
 * resulting skill results, estimated level, or (if a policy is ever
 * activated) confirmed level in any way — those are entirely server- and
 * database-derived.
 */
export async function submitAssessmentAction(
  _state: SubmitAssessmentActionState,
  formData: FormData,
): Promise<SubmitAssessmentActionState> {
  const { user } = await verifySession();

  const validated = AssessmentIdSchema.safeParse(formData.get("assessmentId"));
  if (!validated.success) {
    return { error: "Invalid assessment." };
  }

  const supabase = await createClient();
  const { data: owned, error } = await supabase
    .from("language_assessments")
    .select("id")
    .eq("id", validated.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { error: toSafeErrorMessage(error, GENERIC_ERROR_MESSAGE) };
  }
  if (!owned) {
    return { error: "That assessment couldn't be found." };
  }

  await submitAssessment(user.id, validated.data);

  return { success: true };
}
