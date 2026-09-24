/**
 * Deterministic, explainable skill-score math. No AI involvement — see
 * AGENTS.md Section 16 ("AI extraction vs deterministic logic").
 *
 * CONCURRENCY / SINGLE SOURCE OF TRUTH: the grammar score is NOT computed
 * here and passed into the database as a final value. An earlier version
 * of this file did exactly that (application code read the prior score,
 * computed a new cumulative score, and the ingest RPC simply persisted
 * it) — two concurrent ingestions for the same (user, target_language)
 * could both read the same stale prior state, and the second write would
 * silently clobber the first lesson's contribution.
 *
 * The actual score is now a Postgres GENERATED COLUMN on
 * `language_brain_skill_states`
 * (`score = round(100.0 * positive_evidence_count / evidence_count)`,
 * see 0006_language_brain.sql), computed by the database from two raw
 * cumulative counters that are atomically ADDED to (never overwritten)
 * via `INSERT ... ON CONFLICT DO UPDATE SET x = x + excluded.x` inside
 * `language_brain_ingest_lesson()`. Application code
 * (src/lib/languageBrain/ingest.ts) only ever computes and sends THIS
 * LESSON's own raw counts — it never reads or recomputes the cumulative
 * total, so there is no shared mutable state for a race to corrupt.
 *
 * `deriveGrammarScore` below is NOT used by any write path. It exists
 * solely so the one formula that matters (the generated column's
 * expression) is documented and unit-tested outside of a live Postgres
 * instance — see scoring.test.ts's "equivalence" tests. If the SQL
 * expression in 0006_language_brain.sql ever changes, update this
 * function and its tests to match, or the two will silently describe
 * different formulas even though only the SQL one actually runs.
 */

/**
 * Mirrors `language_brain_skill_states.score`'s generated-column
 * expression exactly: `round(100.0 * positive / total)`, or null with no
 * evidence. Because raw integer counters are summed exactly before this
 * single rounding step ever runs, repeated accumulation cannot compound
 * rounding error the way re-averaging a previously-rounded percentage
 * would.
 */
export function deriveGrammarScore(positiveEvidenceCount: number, evidenceCount: number): number | null {
  if (evidenceCount <= 0) {
    return null;
  }
  if (positiveEvidenceCount < 0 || positiveEvidenceCount > evidenceCount) {
    throw new Error("positiveEvidenceCount must be between 0 and evidenceCount.");
  }

  return Math.round((100 * positiveEvidenceCount) / evidenceCount);
}

/**
 * Normalizes a raw vocabulary term into its dedup key. Deliberately
 * simple (lowercase + trim + collapse whitespace) — this is not
 * lemmatization, which would need real linguistic tooling per language;
 * documented as a known limitation (AGENTS.md).
 */
export function normalizeVocabularyCanonicalForm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Deterministic fallback pattern key when AI classification is
 * unavailable or rejected (see errorClassification.ts) — never blocks
 * ingestion on the AI provider. Two different original/corrected pairs
 * that happen to slugify identically will merge into one pattern, which
 * is an acceptable, documented imprecision for a fallback path; the
 * primary path (AI-classified patternKey) is more precise.
 */
export function slugifyPatternKeyFallback(correctedText: string): string {
  const slug = correctedText
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);

  return slug.length > 0 ? slug : "unclassified";
}
