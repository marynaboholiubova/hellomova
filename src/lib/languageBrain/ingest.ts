import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { LessonSummarySchema } from "@/lib/lessons/schemas";
import { classifyObservedCorrections, type ObservedCorrection } from "./errorClassification";
import { normalizeVocabularyCanonicalForm } from "./scoring";
import { GRAMMAR_FAMILY_CATEGORIES, EXTRACTION_VERSION } from "./constants";

interface TeacherCorrectionMetadata {
  correction?: {
    hasCorrection: boolean;
    original: string | null;
    corrected: string | null;
    explanation: string | null;
  };
}

/**
 * Ingests one completed lesson session into durable Language Brain state.
 * Safe to call more than once for the same session — idempotency is
 * enforced by `language_brain_ingestions.lesson_session_id` being unique
 * and the ingest RPC no-op'ing once that row reaches 'completed' (see
 * 0006_language_brain.sql). Never throws: a failure here must not
 * corrupt lesson completion, which has already succeeded by the time
 * this is called (AGENTS.md Section 25) — it records a retryable
 * 'failed' status instead.
 *
 * Called from two places: synchronously right after
 * sendLessonMessageAction marks a session 'completed', and lazily from
 * src/lib/languageBrain/dal.ts (getLanguageBrainSummary) for any of the
 * caller's own completed sessions that don't yet have a 'completed'
 * ingestion row — a self-healing retry with no cron/queue infrastructure.
 */
export async function ensureLessonIngested(sessionId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const startedAt = Date.now();

  const { data: session, error: sessionError } = await supabase
    .from("lesson_sessions")
    .select("id, user_id, target_language_code, status, summary")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    console.error("[languageBrain] ingestion could not load lesson session", {
      sessionId,
      hasError: Boolean(sessionError),
    });
    return;
  }

  // Only completed sessions carry evidence worth ingesting. An abandoned
  // or still-active session is simply not processed — no fabricated
  // partial evidence.
  if (session.status !== "completed") {
    return;
  }

  const { error: insertError } = await supabase.from("language_brain_ingestions").insert({
    lesson_session_id: session.id,
    user_id: session.user_id,
    target_language_code: session.target_language_code,
    status: "pending",
    extraction_version: EXTRACTION_VERSION,
  });

  if (insertError && insertError.code !== "23505") {
    console.error("[languageBrain] could not create ingestion record", { sessionId });
    return;
  }

  const { data: ingestionRow } = await supabase
    .from("language_brain_ingestions")
    .select("status, attempt_count")
    .eq("lesson_session_id", session.id)
    .maybeSingle();

  if (!ingestionRow || ingestionRow.status === "completed") {
    // Already ingested (or the row vanished between insert and read,
    // which only happens if the lesson_session itself was deleted) —
    // idempotent no-op either way.
    return;
  }

  await supabase
    .from("language_brain_ingestions")
    .update({ attempt_count: ingestionRow.attempt_count + 1, error_message: null })
    .eq("lesson_session_id", session.id);

  try {
    const { data: messages, error: messagesError } = await supabase
      .from("lesson_messages")
      .select("role, metadata")
      .eq("lesson_session_id", session.id)
      .order("created_at", { ascending: true });

    if (messagesError || !messages) {
      throw new Error("Could not load lesson messages for ingestion.");
    }

    const learnerTurnCount = messages.filter((m) => m.role === "learner").length;

    const observedCorrections: ObservedCorrection[] = [];
    for (const message of messages) {
      if (message.role !== "teacher") continue;
      const metadata = message.metadata as TeacherCorrectionMetadata | null;
      const correction = metadata?.correction;
      if (correction?.hasCorrection && correction.original && correction.corrected) {
        observedCorrections.push({
          index: observedCorrections.length,
          original: correction.original,
          corrected: correction.corrected,
          explanation: correction.explanation,
        });
      }
    }

    const classified = await classifyObservedCorrections(observedCorrections);

    // Dedupe by patternKey WITHIN this one lesson: repeating the same
    // mistake many times in a single lesson must count as at most one
    // occurrence toward the cross-lesson recurrence counter (AGENTS.md
    // Section 7) — otherwise a single bad lesson could fake "recurring."
    const errorsByPatternKey = new Map<string, (typeof classified)[number]>();
    for (const item of classified) {
      if (!errorsByPatternKey.has(item.patternKey)) {
        errorsByPatternKey.set(item.patternKey, item);
      }
    }
    const dedupedErrors = [...errorsByPatternKey.values()];

    const grammarNegativeTurns = dedupedErrors.filter((e) =>
      (GRAMMAR_FAMILY_CATEGORIES as readonly string[]).includes(e.category),
    ).length;
    const grammarPositiveTurns = Math.max(0, learnerTurnCount - grammarNegativeTurns);

    // Only THIS LESSON's raw counts are computed here — never a
    // cumulative final score. The RPC atomically ADDS these to the
    // stored counters (INSERT ... ON CONFLICT DO UPDATE SET x = x +
    // excluded.x), which is what makes two concurrent ingestions for the
    // same (user, target_language_code) safe: there is no read-modify-
    // write of shared cross-lesson state on this side at all, so there is
    // nothing here for a race to corrupt. See 0006_language_brain.sql's
    // comment on language_brain_skill_states for the full reasoning.

    const parsedSummary = LessonSummarySchema.safeParse(session.summary);
    const rawVocabularyTerms = parsedSummary.success ? parsedSummary.data.vocabulary : [];

    const vocabularyByCanonicalForm = new Map<string, { canonicalForm: string; surfaceForm: string; exampleSentence: null }>();
    for (const term of rawVocabularyTerms) {
      const canonicalForm = normalizeVocabularyCanonicalForm(term);
      if (canonicalForm.length === 0) continue;
      if (!vocabularyByCanonicalForm.has(canonicalForm)) {
        vocabularyByCanonicalForm.set(canonicalForm, {
          canonicalForm,
          surfaceForm: term,
          exampleSentence: null,
        });
      }
    }

    const { error: rpcError } = await supabase.rpc("language_brain_ingest_lesson", {
      p_lesson_session_id: session.id,
      p_user_id: session.user_id,
      p_target_language_code: session.target_language_code,
      p_extraction_version: EXTRACTION_VERSION,
      p_errors: dedupedErrors.map((e) => ({
        category: e.category,
        patternKey: e.patternKey,
        original: e.original,
        corrected: e.corrected,
        explanation: e.explanation,
      })),
      p_vocabulary: [...vocabularyByCanonicalForm.values()],
      p_grammar_total_turns: learnerTurnCount,
      p_grammar_positive_turns: grammarPositiveTurns,
      p_duration_ms: Date.now() - startedAt,
    });

    if (rpcError) {
      throw new Error("Ingestion RPC failed.");
    }

    console.log("[languageBrain] ingestion completed", {
      sessionId: session.id,
      extractionVersion: EXTRACTION_VERSION,
      errorsExtracted: dedupedErrors.length,
      vocabularyExtracted: vocabularyByCanonicalForm.size,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[languageBrain] ingestion failed, will retry later", {
      sessionId: session.id,
      errorName: error instanceof Error ? error.name : "unknown",
    });

    await supabase
      .from("language_brain_ingestions")
      .update({ status: "failed", error_message: "Ingestion failed; will retry." })
      .eq("lesson_session_id", session.id);
  }
}
