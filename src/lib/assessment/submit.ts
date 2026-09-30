import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getLanguageByCode } from "@/constants/languages";
import { selectAssessmentItems, resolveStartingCefrTarget } from "./itemSelection";
import { evaluateWritingResponse } from "./writingEvaluation";
import { computeWritingRawScore } from "./scoring";
import {
  McqPromptSchema,
  WritingPromptSchema,
  WritingRubricCriteriaSchema,
  PublicAssessmentItemSchema,
  type PublicAssessmentItem,
} from "./schemas";
import type { AssessmentType } from "./constants";

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

export type StartAssessmentResult =
  | { success: true; assessmentId: string; items: PublicAssessmentItem[] }
  | { success: false; reason: "unavailable" | "error" };

/**
 * Starts a new assessment: deterministically selects real, active,
 * versioned items (never fabricated content — returns `unavailable` when
 * none exist for this language, the same honest contract placement v1
 * uses), then atomically creates the language_assessments row plus one
 * unanswered response placeholder per item via cefr_v2_create_assessment.
 * Returns only the CLIENT-SAFE item shape (prompt/options, never an
 * answer key) — see PublicAssessmentItemSchema.
 */
export async function startAssessment(
  userId: string,
  targetLanguageCode: string,
  assessmentType: AssessmentType,
  sourceCefrLevel: string | null,
): Promise<StartAssessmentResult> {
  const cefrTarget = resolveStartingCefrTarget(sourceCefrLevel);
  const selectedItems = await selectAssessmentItems(targetLanguageCode, cefrTarget);

  if (selectedItems.length === 0) {
    return { success: false, reason: "unavailable" };
  }

  const supabase = createServiceRoleClient();

  const { data: assessmentId, error: createError } = await supabase.rpc("cefr_v2_create_assessment", {
    p_user_id: userId,
    p_target_language_code: targetLanguageCode,
    p_assessment_type: assessmentType,
    p_source_cefr_level: sourceCefrLevel,
    p_item_version_ids: selectedItems.map((i) => i.itemVersionId),
  });

  if (createError || !assessmentId) {
    console.error("[assessment] cefr_v2_create_assessment failed", { targetLanguageCode, assessmentType });
    return { success: false, reason: "error" };
  }

  const { data: responses, error: responsesError } = await supabase
    .from("assessment_responses")
    .select("id, item_version_id")
    .eq("assessment_id", assessmentId);

  if (responsesError || !responses) {
    console.error("[assessment] could not load placeholder responses after creation", { assessmentId });
    return { success: false, reason: "error" };
  }

  const selectedByVersionId = new Map(selectedItems.map((i) => [i.itemVersionId, i]));

  const items: PublicAssessmentItem[] = [];
  for (const response of responses) {
    const selected = selectedByVersionId.get(response.item_version_id);
    if (!selected) continue;

    const promptSchema = selected.itemType === "multiple_choice" ? McqPromptSchema : WritingPromptSchema;
    const promptResult = promptSchema.safeParse(selected.prompt);
    if (!promptResult.success) {
      // Malformed authored content — never sent to the client. Logged for
      // content-authoring follow-up, not fatal to the rest of the attempt.
      console.error("[assessment] item version has malformed prompt content, skipping", {
        itemVersionId: selected.itemVersionId,
      });
      continue;
    }

    const candidate = {
      responseId: response.id,
      itemType: selected.itemType,
      skill: selected.skill,
      prompt: promptResult.data,
    };
    const validated = PublicAssessmentItemSchema.safeParse(candidate);
    if (validated.success) {
      items.push(validated.data);
    }
  }

  return { success: true, assessmentId, items };
}

export interface RecordResponseInput {
  selectedOptionId?: string;
  writtenResponse?: string;
}

/** Records/updates one answer. Returns false (not an error, just "did not
 * apply") when the response doesn't belong to this user or the parent
 * assessment is no longer in_progress — the caller shows a generic
 * message, never a raw error. */
export async function recordAssessmentResponse(
  userId: string,
  responseId: string,
  input: RecordResponseInput,
): Promise<boolean> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("cefr_v2_record_response", {
    p_response_id: responseId,
    p_user_id: userId,
    p_selected_option_id: input.selectedOptionId ?? null,
    p_written_response: input.writtenResponse ?? null,
  });

  if (error) {
    console.error("[assessment] cefr_v2_record_response failed", { responseId });
    return false;
  }

  return Boolean(data);
}

async function getPendingWritingResponseIds(
  supabase: ServiceRoleClient,
  assessmentId: string,
): Promise<string[]> {
  const { data: responses } = await supabase
    .from("assessment_responses")
    .select("id, item_version_id")
    .eq("assessment_id", assessmentId);

  if (!responses || responses.length === 0) return [];

  const { data: versions } = await supabase
    .from("assessment_item_versions")
    .select("id, item_type")
    .in(
      "id",
      responses.map((r) => r.item_version_id),
    );

  const writingVersionIds = new Set((versions ?? []).filter((v) => v.item_type === "writing_prompt").map((v) => v.id));
  const writingResponseIds = responses.filter((r) => writingVersionIds.has(r.item_version_id)).map((r) => r.id);

  if (writingResponseIds.length === 0) return [];

  const { data: evaluated } = await supabase
    .from("writing_evaluations")
    .select("response_id")
    .in("response_id", writingResponseIds);

  const evaluatedSet = new Set((evaluated ?? []).map((e) => e.response_id));
  return writingResponseIds.filter((id) => !evaluatedSet.has(id));
}

/**
 * Evaluates every still-pending writing response for one assessment (safe
 * to call repeatedly — already-evaluated responses are skipped via the
 * unique(response_id) constraint AND the pending-id derivation above), and
 * finalizes the writing skill result + completes the assessment once
 * every writing response has a real evaluation. Mirrors
 * src/lib/languageBrain/ingest.ts's retry-safe orchestration pattern: a
 * partial failure leaves the assessment in 'evaluating' (not 'failed')
 * whenever there is a legitimate reason to expect a retry might succeed,
 * and only actually-unrecoverable states (no active rubric) fail outright.
 */
async function evaluateAndFinalizeWriting(
  supabase: ServiceRoleClient,
  userId: string,
  assessmentId: string,
  pendingResponseIds: string[],
): Promise<void> {
  if (pendingResponseIds.length === 0) {
    await finalizeIfAllEvaluated(supabase, userId, assessmentId);
    return;
  }

  const { data: rubricRow } = await supabase
    .from("writing_rubric_versions")
    .select("id, criteria")
    .eq("status", "active")
    .maybeSingle();

  if (!rubricRow) {
    // No active rubric to evaluate against — cannot honestly produce a
    // score. Fail outright (no fake score) rather than leave the learner
    // stuck forever in 'evaluating' with no path to a retry ever helping.
    console.error("[assessment] no active writing rubric — failing assessment", { assessmentId });
    await supabase
      .from("language_assessments")
      .update({ status: "failed" })
      .eq("id", assessmentId)
      .eq("status", "evaluating");
    return;
  }

  const criteriaResult = WritingRubricCriteriaSchema.safeParse(rubricRow.criteria);
  if (!criteriaResult.success) {
    console.error("[assessment] active writing rubric has malformed criteria — failing assessment", { assessmentId });
    await supabase
      .from("language_assessments")
      .update({ status: "failed" })
      .eq("id", assessmentId)
      .eq("status", "evaluating");
    return;
  }

  const { data: assessmentRow } = await supabase
    .from("language_assessments")
    .select("target_language_code")
    .eq("id", assessmentId)
    .maybeSingle();

  const targetLanguageName = assessmentRow
    ? (getLanguageByCode(assessmentRow.target_language_code)?.name ?? assessmentRow.target_language_code)
    : "the target language";

  const { data: responses } = await supabase
    .from("assessment_responses")
    .select("id, written_response, item_version_id")
    .in("id", pendingResponseIds);

  if (!responses) {
    console.error("[assessment] could not load pending writing responses", { assessmentId });
    return; // leave in 'evaluating' — a later retry can pick this up
  }

  for (const response of responses) {
    const { data: itemVersion } = await supabase
      .from("assessment_item_versions")
      .select("prompt")
      .eq("id", response.item_version_id)
      .maybeSingle();

    const promptParsed = WritingPromptSchema.safeParse(itemVersion?.prompt);
    const promptText = promptParsed.success ? promptParsed.data.text : "";

    const evaluation = await evaluateWritingResponse({
      promptText,
      learnerResponse: response.written_response ?? "",
      rubricCriteria: criteriaResult.data,
      targetLanguageName,
    });

    if (!evaluation.success) {
      // Real, honest failure for this response — leave the assessment in
      // 'evaluating' (not 'failed') so a retry (re-invoking submit) can
      // attempt this same response again; already-evaluated responses in
      // this loop are unaffected since each insert already committed.
      console.error("[assessment] writing evaluation failed for a response, will retry later", {
        assessmentId,
        responseId: response.id,
      });
      return;
    }

    const { error: insertError } = await supabase.from("writing_evaluations").insert({
      response_id: response.id,
      user_id: userId,
      rubric_version_id: rubricRow.id,
      criterion_results: evaluation.data.criterionResults,
      ai_model: evaluation.aiModel,
    });

    if (insertError && insertError.code !== "23505") {
      console.error("[assessment] could not persist writing evaluation, will retry later", {
        assessmentId,
        responseId: response.id,
      });
      return;
    }
  }

  await finalizeIfAllEvaluated(supabase, userId, assessmentId);
}

async function finalizeIfAllEvaluated(
  supabase: ServiceRoleClient,
  userId: string,
  assessmentId: string,
): Promise<void> {
  const stillPending = await getPendingWritingResponseIds(supabase, assessmentId);
  if (stillPending.length > 0) {
    return; // not actually done yet — a subsequent retry will finish it
  }

  const { data: allResponses } = await supabase
    .from("assessment_responses")
    .select("id, item_version_id")
    .eq("assessment_id", assessmentId);

  const { data: allVersions } = await supabase
    .from("assessment_item_versions")
    .select("id, item_type")
    .in("id", (allResponses ?? []).map((r) => r.item_version_id));

  const writingVersionIds = new Set(
    (allVersions ?? []).filter((v) => v.item_type === "writing_prompt").map((v) => v.id),
  );
  const writingResponseIds = (allResponses ?? [])
    .filter((r) => writingVersionIds.has(r.item_version_id))
    .map((r) => r.id);

  if (writingResponseIds.length === 0) {
    return; // nothing to finalize (shouldn't happen if this was called correctly, but fail safe)
  }

  const { data: evaluations } = await supabase
    .from("writing_evaluations")
    .select("criterion_results")
    .in("response_id", writingResponseIds);

  if (!evaluations || evaluations.length === 0) {
    return;
  }

  const perResponseScores = evaluations.map((evaluation) =>
    computeWritingRawScore(
      (evaluation.criterion_results as Array<{ criterion: string; score: number }>).map((c) => ({
        criterion: c.criterion,
        score: c.score,
      })),
    ),
  );
  const overallRawScore =
    Math.round((perResponseScores.reduce((sum, s) => sum + s, 0) / perResponseScores.length) * 100) / 100;

  // items_administered/items_evaluated are intentionally NOT sent — the
  // SQL function derives both itself from persisted assessment_responses/
  // writing_evaluations rows and refuses to complete if they don't add
  // up, rather than trusting these caller-computed counts (see
  // cefr_v2_finalize_writing_skill's header in 0007_cefr_assessment_v2.sql).
  const { error: finalizeError } = await supabase.rpc("cefr_v2_finalize_writing_skill", {
    p_assessment_id: assessmentId,
    p_user_id: userId,
    p_raw_score: overallRawScore,
  });

  if (finalizeError) {
    // The SQL function independently re-derives and validates evidence
    // counts and can legitimately refuse to finalize — never swallow that
    // silently. The assessment stays in 'evaluating'; a later
    // submitAssessment retry can pick this back up.
    console.error("[assessment] cefr_v2_finalize_writing_skill failed", { assessmentId });
  }
}

/**
 * Finalizes the response set for one assessment: idempotent (safe to
 * call twice — see cefr_v2_submit_assessment's own idempotency guard) and
 * retry-safe for writing evaluation (see evaluateAndFinalizeWriting).
 * Never blocks on a slow/failing AI call for a pure-MCQ assessment, which
 * completes synchronously inside the RPC itself.
 */
export async function submitAssessment(userId: string, assessmentId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: submitResult, error: submitError } = await supabase.rpc("cefr_v2_submit_assessment", {
    p_assessment_id: assessmentId,
    p_user_id: userId,
  });

  if (submitError) {
    console.error("[assessment] cefr_v2_submit_assessment failed", { assessmentId });
    return;
  }

  const result = submitResult as {
    alreadySubmitted?: boolean;
    status?: string;
    completed?: boolean;
    pendingWritingResponseIds?: string[];
  } | null;

  if (!result || result.completed) {
    return;
  }

  if (result.alreadySubmitted) {
    if (result.status !== "evaluating") {
      return; // completed/failed/abandoned are all terminal; nothing to retry
    }
    const pending = await getPendingWritingResponseIds(supabase, assessmentId);
    await evaluateAndFinalizeWriting(supabase, userId, assessmentId, pending);
    return;
  }

  const pendingWritingResponseIds = result.pendingWritingResponseIds ?? [];
  await evaluateAndFinalizeWriting(supabase, userId, assessmentId, pendingWritingResponseIds);
}
