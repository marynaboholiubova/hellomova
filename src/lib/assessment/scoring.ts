import { SKILL_PASS_THRESHOLD } from "./constants";

export interface SkillAttemptEvidence {
  administered: number;
  correct: number;
}

/**
 * Mirrors 0007_cefr_assessment_v2.sql's cefr_v2_submit_assessment
 * per-skill evidence gate EXACTLY — the same >= 2/3 threshold placement
 * v1 already uses (src/lib/placement/scoring.ts's PASS_THRESHOLD),
 * carried forward rather than reinvented. This function is NOT used by
 * any write path — the SQL function is the actual source of truth for
 * the real decision, for the same reason
 * src/lib/languageBrain/scoring.ts's deriveGrammarScore mirrors rather
 * than drives its generated column. It exists purely so the formula is
 * documented and unit-tested outside of a live Postgres instance; if the
 * SQL threshold or logic ever changes, mirror the change here too.
 */
export function isSkillEvidencePassing(evidence: SkillAttemptEvidence): boolean {
  if (evidence.administered <= 0) {
    throw new Error("isSkillEvidencePassing requires at least one administered item.");
  }
  if (evidence.correct < 0 || evidence.correct > evidence.administered) {
    throw new Error("evidence.correct must be between 0 and evidence.administered.");
  }
  return evidence.correct / evidence.administered >= SKILL_PASS_THRESHOLD;
}

/**
 * Mirrors 0007_cefr_assessment_v2.sql's cefr_v2_submit_assessment
 * mixed-band handling EXACTLY (not used by any write path — see this
 * file's header note on "mirror, not source of truth"). Resolves ONE
 * estimated CEFR level for a skill's evidence in one attempt ONLY when
 * every answered item for that skill shares exactly one CEFR band —
 * determined by counting distinct bands, never by picking an arbitrary
 * item (there is no row-order concept here at all, unlike the SQL
 * `limit 1` this replaced). When a skill's evidence spans more than one
 * band in a single attempt (a future boundary/adaptive assessment), this
 * deliberately returns null rather than guessing or averaging — the
 * per-band evidence is still real (administered/correct), there just
 * isn't yet an honest way to collapse it into one level.
 */
export function resolveSkillEstimatedLevel(
  evidence: SkillAttemptEvidence,
  bandsRepresented: readonly string[],
): string | null {
  const distinctBands = new Set(bandsRepresented);
  if (distinctBands.size !== 1) {
    return null;
  }
  if (!isSkillEvidencePassing(evidence)) {
    return null;
  }
  const [onlyBand] = distinctBands;
  return onlyBand;
}

/** The exact descriptive percentage this skill's MCQ evidence represents
 * in this one attempt — never itself a CEFR level, never blended across
 * skills (AGENTS.md's "no simple average" rule governs CONFIRMATION
 * decisions, which this is not). Mirrors the SQL function's
 * `round(100.0 * correct / administered, 2)`. */
export function computeSkillRawScore(evidence: SkillAttemptEvidence): number {
  if (evidence.administered <= 0) {
    throw new Error("computeSkillRawScore requires at least one administered item.");
  }
  return Math.round((100 * evidence.correct) / evidence.administered * 100) / 100;
}

export interface CriterionScore {
  criterion: string;
  score: number;
}

/**
 * A plain mean of a writing response's own rubric criterion scores — a
 * descriptive evidence number for the writing SKILL in THIS attempt
 * (mirrors how the MCQ raw_score is "percent correct in this attempt").
 * This is NOT the cross-skill averaging AGENTS.md forbids: it never
 * blends across skills, and it is never itself used to decide a CEFR
 * level or a pass/fail outcome — only stored as descriptive evidence on
 * assessment_skill_results.raw_score.
 */
export function computeWritingRawScore(criterionScores: CriterionScore[]): number {
  if (criterionScores.length === 0) {
    throw new Error("computeWritingRawScore requires at least one criterion score.");
  }
  const sum = criterionScores.reduce((total, c) => total + c.score, 0);
  return Math.round((sum / criterionScores.length) * 100) / 100;
}
