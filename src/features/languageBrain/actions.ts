"use server";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { ReviewItemIdSchema, ReviewResultSchema } from "@/lib/languageBrain/schemas";
import { computeNextReview } from "@/lib/languageBrain/spacedRepetition";
import { toSafeErrorMessage } from "@/lib/utils/errors";

export type RecordReviewResultActionState = { error: string } | { success: true } | undefined;

/**
 * Server-side foundation for recording a spaced-repetition review result
 * (AGENTS.md Section 12) — not yet wired to an interactive Review Mode
 * screen (that UI doesn't exist yet; see AGENTS.md's Phase 4 scope
 * boundary), but fully real and tested: ownership-checked, and the new
 * stage/due date/mastery score are computed by trusted, deterministic
 * code (src/lib/languageBrain/spacedRepetition.ts), never trusted from
 * the client — the client only ever supplies which item and whether the
 * learner recalled it, never the resulting schedule or score.
 */
export async function recordReviewResultAction(
  _state: RecordReviewResultActionState,
  formData: FormData,
): Promise<RecordReviewResultActionState> {
  const { user } = await verifySession();

  const reviewItemIdResult = ReviewItemIdSchema.safeParse(formData.get("reviewItemId"));
  const resultResult = ReviewResultSchema.safeParse(formData.get("result"));

  if (!reviewItemIdResult.success) {
    return { error: "Invalid review item." };
  }
  if (!resultResult.success) {
    return { error: "Invalid review result." };
  }

  const reviewItemId = reviewItemIdResult.data;
  const result = resultResult.data;

  // Ownership check on the ordinary RLS-scoped client — a review item
  // that exists but belongs to another user looks identical to one that
  // doesn't exist at all, same pattern as getOwnedLessonSession.
  const supabase = await createClient();
  const { data: reviewItem, error: fetchError } = await supabase
    .from("language_brain_review_items")
    .select("id, review_stage, source_type")
    .eq("id", reviewItemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError || !reviewItem) {
    return { error: "That review item couldn't be found." };
  }

  const outcome = computeNextReview(reviewItem.review_stage, result);

  // The write requires service_role: language_brain_review_items grants
  // no update to authenticated (see 0006_language_brain.sql) — a review
  // result changes derived learning state, which must never be
  // browser-writable directly, same trust boundary as the lesson engine.
  const serviceRoleClient = createServiceRoleClient();
  const { data: applied, error: rpcError } = await serviceRoleClient.rpc(
    "language_brain_record_review_result",
    {
      p_review_item_id: reviewItemId,
      p_user_id: user.id,
      p_expected_current_stage: reviewItem.review_stage,
      p_result: result,
      p_new_stage: outcome.newStage,
      p_new_due_at: outcome.newDueAt.toISOString(),
      p_new_mastery_score: outcome.newMasteryScore,
    },
  );

  if (rpcError) {
    return { error: toSafeErrorMessage(rpcError, "Couldn't record your review. Please try again.") };
  }

  if (!applied) {
    return { error: "This review item was already updated elsewhere. Please refresh and try again." };
  }

  return { success: true };
}
