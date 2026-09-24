import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  GRAMMAR_FAMILY_CATEGORIES,
  MAX_PERSONALIZATION_DUE_VOCABULARY,
  MAX_PERSONALIZATION_GRAMMAR_PATTERNS,
  MAX_PERSONALIZATION_STRENGTHS,
  MAX_PERSONALIZATION_WEAK_AREAS,
} from "./constants";

export interface LessonBrainContext {
  /** e.g. "past tense irregular verbs (seen 4 times): \"I goed\" -> \"I went\"" */
  topGrammarPatterns: string[];
  /** Vocabulary terms due for review right now. */
  dueVocabulary: string[];
  /** Short human-readable weak-area labels, any category. */
  weakAreas: string[];
  /** Short human-readable strength labels. */
  strengths: string[];
}

const EMPTY_CONTEXT: LessonBrainContext = {
  topGrammarPatterns: [],
  dueVocabulary: [],
  weakAreas: [],
  strengths: [],
};

/**
 * Builds a small, BOUNDED summary of the learner's Language Brain state
 * for one target language, to be woven into the lesson system prompt
 * (AGENTS.md Section 13/14). Every array here is capped — this never
 * dumps history into the prompt, and it protects against token growth as
 * a learner's evidence accumulates over months of lessons.
 *
 * Scoped to (userId, targetLanguageCode) via the ordinary RLS-scoped
 * client — this always runs inside a request already authenticated as
 * that same user (called from src/features/lessons/actions.ts using the
 * session's own snapshot fields, never client input), so auth.uid()
 * matches userId and RLS is a real backstop here, not just decoration.
 */
export async function buildLessonPersonalizationContext(
  userId: string,
  targetLanguageCode: string,
): Promise<LessonBrainContext> {
  const supabase = await createClient();

  const [grammarPatternsResult, dueReviewResult, weakAreasResult, skillStatesResult] = await Promise.all([
    supabase
      .from("language_brain_error_patterns")
      .select("pattern_key, occurrence_count, example_original, example_corrected")
      .eq("user_id", userId)
      .eq("target_language_code", targetLanguageCode)
      .eq("status", "active")
      .eq("is_recurring", true)
      .in("category", GRAMMAR_FAMILY_CATEGORIES)
      .order("occurrence_count", { ascending: false })
      .limit(MAX_PERSONALIZATION_GRAMMAR_PATTERNS),
    supabase
      .from("language_brain_review_items")
      .select("source_id, source_type")
      .eq("user_id", userId)
      .eq("target_language_code", targetLanguageCode)
      .eq("status", "pending")
      .eq("source_type", "vocabulary")
      .lte("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(MAX_PERSONALIZATION_DUE_VOCABULARY),
    supabase
      .from("language_brain_error_patterns")
      .select("category, pattern_key, occurrence_count, is_recurring, last_seen_at")
      .eq("user_id", userId)
      .eq("target_language_code", targetLanguageCode)
      .eq("status", "active")
      .order("occurrence_count", { ascending: false })
      .limit(MAX_PERSONALIZATION_WEAK_AREAS),
    supabase
      .from("language_brain_skill_states")
      .select("skill, score, evidence_count")
      .eq("user_id", userId)
      .eq("target_language_code", targetLanguageCode)
      .not("score", "is", null)
      .gte("score", 75)
      .gte("evidence_count", 5)
      .limit(MAX_PERSONALIZATION_STRENGTHS),
  ]);

  const dueVocabIds = (dueReviewResult.data ?? []).map((r) => r.source_id);
  const { data: dueVocabTerms } =
    dueVocabIds.length > 0
      ? await supabase.from("language_brain_vocabulary").select("id, surface_form").in("id", dueVocabIds)
      : { data: [] as { id: string; surface_form: string }[] };

  return {
    topGrammarPatterns: (grammarPatternsResult.data ?? []).map(
      (p) =>
        `${p.pattern_key.replace(/-/g, " ")} (seen ${p.occurrence_count} times): "${p.example_original}" -> "${p.example_corrected}"`,
    ),
    dueVocabulary: (dueVocabTerms ?? []).map((v) => v.surface_form),
    weakAreas: (weakAreasResult.data ?? []).map(
      (p) => `${p.category.replace(/_/g, " ")}: ${p.pattern_key.replace(/-/g, " ")}`,
    ),
    strengths: (skillStatesResult.data ?? []).map((s) => `${s.skill} (${s.score}% over ${s.evidence_count} messages)`),
  };
}

export function emptyLessonBrainContext(): LessonBrainContext {
  return EMPTY_CONTEXT;
}
