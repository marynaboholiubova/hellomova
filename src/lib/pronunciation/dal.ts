import "server-only";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { CefrLevel } from "@/lib/onboarding/schemas";
import type { PronunciationEvaluation } from "./schemas";

export interface PronunciationAttemptRecord {
  id: string;
  userId: string;
  targetLanguageCode: string;
  nativeLanguageCode: string;
  cefrLevel: CefrLevel | null;
  targetText: string;
  status: "pending" | "completed" | "failed";
  transcript: string | null;
  evaluation: PronunciationEvaluation | null;
  errorReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

const PRONUNCIATION_ATTEMPT_COLUMNS =
  "id, user_id, target_language_code, native_language_code, cefr_level, target_text, status, transcript, evaluation, error_reason, created_at, completed_at";

function toPronunciationAttemptRecord(data: {
  id: string;
  user_id: string;
  target_language_code: string;
  native_language_code: string;
  cefr_level: string | null;
  target_text: string;
  status: string;
  transcript: string | null;
  evaluation: unknown;
  error_reason: string | null;
  created_at: string;
  completed_at: string | null;
}): PronunciationAttemptRecord {
  return {
    id: data.id,
    userId: data.user_id,
    targetLanguageCode: data.target_language_code,
    nativeLanguageCode: data.native_language_code,
    cefrLevel: data.cefr_level as CefrLevel | null,
    targetText: data.target_text,
    status: data.status as PronunciationAttemptRecord["status"],
    transcript: data.transcript,
    evaluation: (data.evaluation as PronunciationEvaluation | null) ?? null,
    errorReason: data.error_reason,
    createdAt: data.created_at,
    completedAt: data.completed_at,
  };
}

/**
 * Loads a pronunciation attempt scoped to BOTH the attempt id AND the
 * authenticated caller's id in the same query — "doesn't exist" and
 * "exists but isn't yours" are indistinguishable, same pattern as
 * getOwnedLessonSession.
 */
export async function getOwnedPronunciationAttempt(attemptId: string): Promise<PronunciationAttemptRecord | null> {
  const { user } = await verifySession();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pronunciation_attempts")
    .select(PRONUNCIATION_ATTEMPT_COLUMNS)
    .eq("id", attemptId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  return data ? toPronunciationAttemptRecord(data) : null;
}
