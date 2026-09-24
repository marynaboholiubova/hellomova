/**
 * Shared, deterministic constants for the Language Brain. Keep these in
 * sync with their SQL counterparts (see comments below) — they are the
 * single documented source of truth for thresholds that must never be
 * decided by the AI classifier (see AGENTS.md Section 16/17).
 */

/** Bump when the extraction/ingestion pipeline's logic changes in a way
 * that would make old ingestion rows interpretable differently — mirrors
 * the placement test's `test_version` / lesson engine's `prompt_version`
 * pattern. Historical `language_brain_ingestions.extraction_version`
 * values stay a true record of what pipeline produced them. */
export const EXTRACTION_VERSION = "brain-v1";

/**
 * A pattern is "recurring" only once it has occurred in at least this
 * many DISTINCT lessons — mirrors the generated column
 * `is_recurring boolean generated always as (occurrence_count >= 2)` in
 * 0006_language_brain.sql. Repeating the same mistake many times within
 * ONE lesson counts as a single occurrence (see ingest.ts's per-lesson
 * dedupe) so a one-off lesson can never look like a recurring weakness.
 */
export const RECURRING_ERROR_THRESHOLD = 2;

export const ERROR_CATEGORIES = [
  "grammar",
  "vocabulary",
  "article",
  "preposition",
  "tense",
  "agreement",
  "word_order",
  "spelling",
  "register",
  "other",
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/** Categories that count against the 'grammar' skill score — see scoring.ts. */
export const GRAMMAR_FAMILY_CATEGORIES: readonly ErrorCategory[] = [
  "grammar",
  "article",
  "preposition",
  "tense",
  "agreement",
  "word_order",
];

/** The only skills Phase 4 ever writes a score for — see scoring.ts and
 * AGENTS.md for why vocabulary/reading/writing/speaking/listening/
 * pronunciation are represented differently (or stay unassessed). */
export const MEASURED_SKILLS = ["grammar"] as const;

export const SPACED_REPETITION_STAGE_INTERVAL_DAYS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 30,
};

export const MAX_REVIEW_STAGE = 4;

/** Bounds for src/lib/languageBrain/personalization.ts — protects prompt
 * token growth (AGENTS.md Section 13). */
export const MAX_PERSONALIZATION_GRAMMAR_PATTERNS = 3;
export const MAX_PERSONALIZATION_DUE_VOCABULARY = 5;
export const MAX_PERSONALIZATION_WEAK_AREAS = 3;
export const MAX_PERSONALIZATION_STRENGTHS = 2;
