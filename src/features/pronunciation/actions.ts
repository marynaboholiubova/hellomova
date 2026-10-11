"use server";

import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getOnboardingProfile, getPrimaryUserLanguage } from "@/lib/onboarding/dal";
import { getOwnedPronunciationAttempt } from "@/lib/pronunciation/dal";
import { checkPronunciationAttemptRateLimit } from "@/lib/pronunciation/rateLimit";
import { generateTargetPhrase } from "@/lib/pronunciation/generatePhrase";
import { transcribeAttemptAudio, evaluatePronunciationTranscript } from "@/lib/pronunciation/evaluate";
import { PronunciationAttemptIdSchema, AUDIO_ACCEPTED_MIME_TYPES, AUDIO_MAX_BYTES } from "@/lib/pronunciation/schemas";
import { CefrLevelSchema } from "@/lib/onboarding/schemas";
import { getLanguageByCode } from "@/constants/languages";
import { toSafeErrorMessage } from "@/lib/utils/errors";
import type { StartPronunciationActionState, SubmitPronunciationActionState } from "./types";

const PROMPT_VERSION = "pronunciation-v1";
const RATE_LIMIT_MESSAGE = "You're sending requests a bit fast — please wait a moment and try again.";
const GENERIC_PROCESSING_ERROR = "Couldn't process your recording right now. Please try again.";

/**
 * Starts a new pronunciation attempt: generates a server-owned target
 * phrase and persists a 'pending' row. No form input is read here at
 * all — target language, native language, and CEFR level all come from
 * the caller's own trusted profile, same trust boundary as
 * loadTrustedLessonContext() in src/features/lessons/actions.ts.
 */
export async function startPronunciationAttemptAction(
  _state: StartPronunciationActionState,
  _formData: FormData,
): Promise<StartPronunciationActionState> {
  const profile = await getOnboardingProfile();

  if (!profile.onboardingCompletedAt || !profile.nativeLanguageCode) {
    return { error: "Please finish onboarding before practicing pronunciation." };
  }

  const primaryLanguage = await getPrimaryUserLanguage();
  if (!primaryLanguage) {
    return { error: "Please choose a target language before practicing pronunciation." };
  }

  const targetLanguage = getLanguageByCode(primaryLanguage.targetLanguageCode);
  const nativeLanguage = getLanguageByCode(profile.nativeLanguageCode);
  if (!targetLanguage || !nativeLanguage) {
    return { error: "Something in your profile looks invalid. Please contact support." };
  }

  const rateLimit = await checkPronunciationAttemptRateLimit(profile.id);
  if (!rateLimit.allowed) {
    return { error: RATE_LIMIT_MESSAGE };
  }

  const cefrResult = CefrLevelSchema.safeParse(primaryLanguage.currentCefrLevel);
  const cefrLevel = cefrResult.success ? cefrResult.data : null;

  const phrase = await generateTargetPhrase({ targetLanguageName: targetLanguage.name, cefrLevel });
  if (!phrase.success) {
    return { error: phrase.errorMessage };
  }

  // Writes use the service-role client: pronunciation_attempts grants NO
  // insert/update to the authenticated role (see 0009_pronunciation.sql).
  // user_id comes from `profile.id`, derived from the server-verified
  // session inside getOnboardingProfile() — never from client input.
  const supabase = createServiceRoleClient();

  const { data: attempt, error: insertError } = await supabase
    .from("pronunciation_attempts")
    .insert({
      user_id: profile.id,
      target_language_code: primaryLanguage.targetLanguageCode,
      native_language_code: profile.nativeLanguageCode,
      cefr_level: primaryLanguage.currentCefrLevel,
      target_text: phrase.data.text,
      prompt_version: PROMPT_VERSION,
    })
    .select("id")
    .single();

  if (insertError || !attempt) {
    return { error: toSafeErrorMessage(insertError, "Couldn't start pronunciation practice. Please try again.") };
  }

  return { success: true, attemptId: attempt.id, targetText: phrase.data.text };
}

/**
 * Submits real recorded audio for an existing 'pending' attempt:
 * transcribes it, evaluates the transcript against the target phrase, and
 * persists the result. The browser supplies exactly two things — which
 * attempt, and the raw audio bytes — nothing else is ever trusted from
 * client input. Ownership, target text, target language, and CEFR level
 * all come from the attempt's own already-persisted, immutable snapshot
 * row (see 0009_pronunciation.sql's lifecycle trigger), never from
 * formData.
 */
export async function submitPronunciationAttemptAction(
  _state: SubmitPronunciationActionState,
  formData: FormData,
): Promise<SubmitPronunciationActionState> {
  const attemptIdResult = PronunciationAttemptIdSchema.safeParse(formData.get("attemptId"));
  if (!attemptIdResult.success) {
    return { error: "Invalid pronunciation attempt." };
  }
  const attemptId = attemptIdResult.data;

  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return { error: "No recording was received. Please try again." };
  }
  if (audio.size === 0) {
    return { error: "That recording was empty. Please try again." };
  }
  if (audio.size > AUDIO_MAX_BYTES) {
    return { error: "That recording is too long. Please keep it to a short phrase." };
  }
  // Browsers report MediaRecorder output with codec parameters, e.g.
  // "audio/webm;codecs=opus" — normalize to the base MIME type before
  // checking against the allow-list rather than rejecting valid audio.
  const baseMimeType = audio.type.split(";")[0]?.trim().toLowerCase();
  if (!AUDIO_ACCEPTED_MIME_TYPES.includes(baseMimeType as (typeof AUDIO_ACCEPTED_MIME_TYPES)[number])) {
    return { error: "That recording's format isn't supported. Please try again." };
  }

  const attempt = await getOwnedPronunciationAttempt(attemptId);
  if (!attempt) {
    return { error: "That pronunciation attempt couldn't be found." };
  }

  // Idempotent replay: already resolved (by an earlier call, or a
  // concurrent one that won the race below) — return the real persisted
  // result rather than re-processing or erroring.
  if (attempt.status === "completed") {
    return { success: true, status: "completed", transcript: attempt.transcript ?? "", evaluation: attempt.evaluation! };
  }
  if (attempt.status === "failed") {
    return { success: true, status: "failed", errorReason: attempt.errorReason ?? GENERIC_PROCESSING_ERROR };
  }

  const transcription = await transcribeAttemptAudio(audio);
  const supabase = createServiceRoleClient();

  if (!transcription.success) {
    const { data: updated } = await supabase
      .from("pronunciation_attempts")
      .update({ status: "failed", error_reason: transcription.errorMessage, completed_at: new Date().toISOString() })
      .eq("id", attemptId)
      .eq("user_id", attempt.userId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (!updated) {
      // Lost the race to a concurrent submit — replay its real result.
      const latest = await getOwnedPronunciationAttempt(attemptId);
      if (latest?.status === "completed") {
        return { success: true, status: "completed", transcript: latest.transcript ?? "", evaluation: latest.evaluation! };
      }
      return { success: true, status: "failed", errorReason: latest?.errorReason ?? transcription.errorMessage };
    }

    return { success: true, status: "failed", errorReason: transcription.errorMessage };
  }

  const evaluation = await evaluatePronunciationTranscript({
    targetLanguageName: getLanguageByCode(attempt.targetLanguageCode)?.name ?? attempt.targetLanguageCode,
    targetText: attempt.targetText,
    transcript: transcription.transcript,
  });

  if (!evaluation.success) {
    const { data: updated } = await supabase
      .from("pronunciation_attempts")
      .update({
        status: "failed",
        transcript: transcription.transcript,
        transcription_model: transcription.model,
        error_reason: evaluation.errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq("id", attemptId)
      .eq("user_id", attempt.userId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (!updated) {
      const latest = await getOwnedPronunciationAttempt(attemptId);
      if (latest?.status === "completed") {
        return { success: true, status: "completed", transcript: latest.transcript ?? "", evaluation: latest.evaluation! };
      }
      return { success: true, status: "failed", errorReason: latest?.errorReason ?? evaluation.errorMessage };
    }

    return { success: true, status: "failed", errorReason: evaluation.errorMessage };
  }

  const { data: updated, error: updateError } = await supabase
    .from("pronunciation_attempts")
    .update({
      status: "completed",
      transcript: transcription.transcript,
      evaluation: evaluation.data,
      transcription_model: transcription.model,
      evaluation_model: evaluation.model,
      completed_at: new Date().toISOString(),
    })
    .eq("id", attemptId)
    .eq("user_id", attempt.userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (updateError) {
    return { error: toSafeErrorMessage(updateError, GENERIC_PROCESSING_ERROR) };
  }

  if (!updated) {
    // Lost the race to a concurrent submit — replay whatever it produced,
    // never our own just-computed (now discarded) result, so there is
    // only ever one authoritative outcome per attempt.
    const latest = await getOwnedPronunciationAttempt(attemptId);
    if (latest?.status === "completed") {
      return { success: true, status: "completed", transcript: latest.transcript ?? "", evaluation: latest.evaluation! };
    }
    return { success: true, status: "failed", errorReason: latest?.errorReason ?? GENERIC_PROCESSING_ERROR };
  }

  return { success: true, status: "completed", transcript: transcription.transcript, evaluation: evaluation.data };
}
