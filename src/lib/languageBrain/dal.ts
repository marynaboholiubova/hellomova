import "server-only";

import { cache } from "react";
import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ensureLessonIngested } from "./ingest";
import type { ErrorCategory } from "./constants";

/** Bounded lookback for the read-triggered retry sweep — see
 * ensureRecentLessonsIngested below. Not a hard limit on lesson history,
 * just how many of the caller's most recent completed lessons get
 * checked for a missing/failed ingestion on each brain-view load. */
const INGESTION_RETRY_SWEEP_LIMIT = 20;
const WEAK_AREA_LIMIT = 3;
const RECENT_PATTERNS_LIMIT = 5;
const DUE_REVIEW_LIST_LIMIT = 10;
const STRENGTH_MIN_SCORE = 75;
const STRENGTH_MIN_EVIDENCE = 5;

export interface LanguageBrainProfile {
  lessonsIngestedCount: number;
  lastIngestedLessonAt: string | null;
}

export interface ErrorPatternRecord {
  id: string;
  category: ErrorCategory;
  patternKey: string;
  exampleOriginal: string;
  exampleCorrected: string;
  explanation: string | null;
  occurrenceCount: number;
  isRecurring: boolean;
  lastSeenAt: string;
}

export interface VocabularyStats {
  encountered: number;
  reviewing: number;
  mastered: number;
}

export interface DueReviewItem {
  reviewItemId: string;
  sourceType: "vocabulary" | "error_pattern";
  term: string | null;
  exampleSentence: string | null;
  dueAt: string;
  reviewStage: number;
}

export interface SkillStateRecord {
  skill: string;
  score: number | null;
  evidenceCount: number;
}

export interface LanguageBrainSummary {
  hasAnyEvidence: boolean;
  profile: LanguageBrainProfile | null;
  strengths: SkillStateRecord[];
  weakAreas: ErrorPatternRecord[];
  recentPatterns: ErrorPatternRecord[];
  vocabulary: VocabularyStats;
  dueReviewItems: DueReviewItem[];
  dueReviewCount: number;
  skills: SkillStateRecord[];
}

/**
 * Self-healing retry sweep (AGENTS.md Section 25): checks the caller's
 * most recent completed lesson sessions for one without a 'completed'
 * ingestion record and re-attempts ingestion for it. No cron/queue
 * infrastructure exists in this app, so a lazy retry on read is the
 * chosen durable model — ensureLessonIngested is itself idempotent, so
 * calling it again for an already-completed ingestion is a cheap no-op.
 */
export async function ensureRecentLessonsIngested(userId: string, targetLanguageCode: string): Promise<void> {
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("lesson_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("target_language_code", targetLanguageCode)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(INGESTION_RETRY_SWEEP_LIMIT);

  if (!sessions || sessions.length === 0) {
    return;
  }

  const sessionIds = sessions.map((s) => s.id);

  const { data: ingestions } = await supabase
    .from("language_brain_ingestions")
    .select("lesson_session_id, status")
    .eq("user_id", userId)
    .in("lesson_session_id", sessionIds);

  const statusBySessionId = new Map((ingestions ?? []).map((i) => [i.lesson_session_id, i.status]));

  const needsIngestion = sessionIds.filter((id) => statusBySessionId.get(id) !== "completed");

  await Promise.all(needsIngestion.map((id) => ensureLessonIngested(id)));
}

/**
 * Weak-area ranking (AGENTS.md Section 10): recurring patterns first,
 * then by how many distinct lessons produced the pattern, then by
 * recency — so a single old, resolved-feeling mistake doesn't outrank a
 * pattern the learner is actively still making. Pure and exported so
 * this ranking logic is unit-testable without a database.
 */
export function rankWeakAreas(patterns: ErrorPatternRecord[]): ErrorPatternRecord[] {
  return [...patterns].sort((a, b) => {
    if (a.isRecurring !== b.isRecurring) return a.isRecurring ? -1 : 1;
    if (a.occurrenceCount !== b.occurrenceCount) return b.occurrenceCount - a.occurrenceCount;
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
  });
}

/** Most-recently-seen patterns first, regardless of recurrence — for the
 * "Recent patterns" dashboard section (AGENTS.md Section 22). */
export function rankRecentPatterns(patterns: ErrorPatternRecord[]): ErrorPatternRecord[] {
  return [...patterns].sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
}

function toErrorPatternRecord(row: {
  id: string;
  category: string;
  pattern_key: string;
  example_original: string;
  example_corrected: string;
  explanation: string | null;
  occurrence_count: number;
  is_recurring: boolean;
  last_seen_at: string;
}): ErrorPatternRecord {
  return {
    id: row.id,
    category: row.category as ErrorCategory,
    patternKey: row.pattern_key,
    exampleOriginal: row.example_original,
    exampleCorrected: row.example_corrected,
    explanation: row.explanation,
    occurrenceCount: row.occurrence_count,
    isRecurring: row.is_recurring,
    lastSeenAt: row.last_seen_at,
  };
}

/**
 * The single entry point the dashboard/Language Brain view reads from.
 * Scoped to (caller, targetLanguageCode) via the ordinary RLS-scoped
 * client — auth.uid() is the real enforcement, this function's explicit
 * .eq("user_id", ...) is defense in depth on top of it, same convention
 * as every other DAL function in this codebase.
 */
export const getLanguageBrainSummary = cache(
  async (targetLanguageCode: string): Promise<LanguageBrainSummary> => {
    const { user } = await verifySession();

    await ensureRecentLessonsIngested(user.id, targetLanguageCode);

    const supabase = await createClient();

    const [profileResult, skillStatesResult, errorPatternsResult, vocabularyResult, dueReviewResult] =
      await Promise.all([
        supabase
          .from("language_brain_profiles")
          .select("lessons_ingested_count, last_ingested_lesson_at")
          .eq("user_id", user.id)
          .eq("target_language_code", targetLanguageCode)
          .maybeSingle(),
        supabase
          .from("language_brain_skill_states")
          .select("skill, score, evidence_count")
          .eq("user_id", user.id)
          .eq("target_language_code", targetLanguageCode),
        supabase
          .from("language_brain_error_patterns")
          .select(
            "id, category, pattern_key, example_original, example_corrected, explanation, occurrence_count, is_recurring, last_seen_at, status",
          )
          .eq("user_id", user.id)
          .eq("target_language_code", targetLanguageCode)
          .eq("status", "active"),
        supabase
          .from("language_brain_vocabulary")
          .select("id, review_stage, mastery_score")
          .eq("user_id", user.id)
          .eq("target_language_code", targetLanguageCode),
        supabase
          .from("language_brain_review_items")
          .select("id, source_type, source_id, due_at, review_stage")
          .eq("user_id", user.id)
          .eq("target_language_code", targetLanguageCode)
          .eq("status", "pending")
          .lte("due_at", new Date().toISOString())
          .order("due_at", { ascending: true })
          .limit(DUE_REVIEW_LIST_LIMIT),
      ]);

    const profile = profileResult.data
      ? {
          lessonsIngestedCount: profileResult.data.lessons_ingested_count,
          lastIngestedLessonAt: profileResult.data.last_ingested_lesson_at,
        }
      : null;

    const skills: SkillStateRecord[] = (skillStatesResult.data ?? []).map((row) => ({
      skill: row.skill,
      score: row.score,
      evidenceCount: row.evidence_count,
    }));

    const strengths = skills.filter(
      (s) => s.score !== null && s.score >= STRENGTH_MIN_SCORE && s.evidenceCount >= STRENGTH_MIN_EVIDENCE,
    );

    const errorPatterns = (errorPatternsResult.data ?? []).map(toErrorPatternRecord);

    const weakAreas = rankWeakAreas(errorPatterns).slice(0, WEAK_AREA_LIMIT);
    const recentPatterns = rankRecentPatterns(errorPatterns).slice(0, RECENT_PATTERNS_LIMIT);

    const vocabRows = vocabularyResult.data ?? [];
    const vocabulary: VocabularyStats = {
      encountered: vocabRows.length,
      mastered: vocabRows.filter((v) => v.mastery_score === 100).length,
      reviewing: vocabRows.filter((v) => v.mastery_score !== 100).length,
    };

    const dueReviewRows = dueReviewResult.data ?? [];
    const vocabIdsNeeded = dueReviewRows
      .filter((r) => r.source_type === "vocabulary")
      .map((r) => r.source_id);

    const { data: dueVocabTerms } =
      vocabIdsNeeded.length > 0
        ? await supabase
            .from("language_brain_vocabulary")
            .select("id, surface_form, example_sentence")
            .in("id", vocabIdsNeeded)
        : { data: [] as { id: string; surface_form: string; example_sentence: string | null }[] };

    const vocabTermById = new Map((dueVocabTerms ?? []).map((v) => [v.id, v]));

    const dueReviewItems: DueReviewItem[] = dueReviewRows.map((row) => {
      const term = row.source_type === "vocabulary" ? vocabTermById.get(row.source_id) : undefined;
      return {
        reviewItemId: row.id,
        sourceType: row.source_type as "vocabulary" | "error_pattern",
        term: term?.surface_form ?? null,
        exampleSentence: term?.example_sentence ?? null,
        dueAt: row.due_at,
        reviewStage: row.review_stage,
      };
    });

    const { count: dueReviewCount } = await supabase
      .from("language_brain_review_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("target_language_code", targetLanguageCode)
      .eq("status", "pending")
      .lte("due_at", new Date().toISOString());

    return {
      hasAnyEvidence: Boolean(profile && profile.lessonsIngestedCount > 0),
      profile,
      strengths,
      weakAreas,
      recentPatterns,
      vocabulary,
      dueReviewItems,
      dueReviewCount: dueReviewCount ?? 0,
      skills,
    };
  },
);
