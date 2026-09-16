import type { CefrLevel } from "@/lib/onboarding/schemas";
import type { PlacementQuestion, PlacementCategory } from "./questions";

export interface PlacementAnswer {
  questionId: string;
  optionId: string;
}

export interface PlacementCategoryResult {
  category: PlacementCategory;
  correct: number;
  total: number;
  percentage: number;
}

export interface PlacementScoreResult {
  score: number;
  totalQuestions: number;
  estimatedLevel: CefrLevel;
  categoryResults: PlacementCategoryResult[];
}

const ALL_LEVELS_ORDER: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

/**
 * The highest level this function will ever return. Three multiple-choice
 * items per band is not enough evidence to responsibly award C2 — real C2
 * assessment needs far broader evidence (extended production, register
 * control, etc.) than a short multiple-choice check can provide. C1 is the
 * ceiling for this deterministic MVP; nothing here claims otherwise.
 * getPlacementBank() already filters C2-tagged items out before a bank is
 * served, so in normal operation this never even sees a C2 item — this
 * guard is deliberate defense in depth in case scorePlacementTest is ever
 * called with an unfiltered bank (e.g. directly, in a test).
 */
const LEVELS_ELIGIBLE_FOR_CREDIT: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];

/** A level counts as passed only if at least this fraction of its own items are correct. */
const PASS_THRESHOLD = 2 / 3;

/**
 * Evidence-gated, deterministic scoring — the fix for the bug where easy
 * items could produce a high CEFR result. Levels are walked IN ORDER from
 * A1. A level is only credited if its own items were answered correctly
 * at or above PASS_THRESHOLD; the walk stops at the first level that
 * isn't cleared, and no later level is ever credited from that point on —
 * regardless of how those later items were answered. A1 is the
 * unconditional floor for a learner who HAS taken this test (the bottom
 * of the CEFR scale this product uses); a learner who has NOT taken any
 * test must never be scored at all — callers must check for that
 * upstream (see getPlacementBank returning null) rather than calling this
 * function with an empty or fabricated answer set.
 *
 * This deliberately does NOT map overall percentage-correct to a band —
 * a learner who aces every A1 item and nothing else stays at A1, never
 * B1/C1, because no B1/C1-aligned item was ever passed.
 */
export function scorePlacementTest(
  bank: PlacementQuestion[],
  answers: PlacementAnswer[],
): PlacementScoreResult {
  const answersByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));

  let score = 0;
  const byCategory = new Map<PlacementCategory, { correct: number; total: number }>();
  let estimatedLevel: CefrLevel = "A1";
  let stillClimbing = true;

  for (const level of ALL_LEVELS_ORDER) {
    const itemsAtLevel = bank.filter((question) => question.level === level);
    if (itemsAtLevel.length === 0) {
      continue;
    }

    let correctAtLevel = 0;
    for (const question of itemsAtLevel) {
      const bucket = byCategory.get(question.category) ?? { correct: 0, total: 0 };
      bucket.total += 1;

      const answer = answersByQuestionId.get(question.id);
      const isCorrect = Boolean(answer && answer.optionId === question.correctOptionId);
      if (isCorrect) {
        score += 1;
        correctAtLevel += 1;
        bucket.correct += 1;
      }

      byCategory.set(question.category, bucket);
    }

    // Items above the credit ceiling (see LEVELS_ELIGIBLE_FOR_CREDIT) are
    // still tallied above for transparency, but never change the level.
    if (!stillClimbing || !LEVELS_ELIGIBLE_FOR_CREDIT.includes(level)) {
      continue;
    }

    const passRatio = correctAtLevel / itemsAtLevel.length;
    if (passRatio >= PASS_THRESHOLD) {
      estimatedLevel = level;
    } else {
      stillClimbing = false;
    }
  }

  const categoryResults: PlacementCategoryResult[] = Array.from(byCategory.entries()).map(
    ([category, { correct, total }]) => ({
      category,
      correct,
      total,
      percentage: total === 0 ? 0 : Math.round((correct / total) * 100),
    }),
  );

  return {
    score,
    totalQuestions: bank.length,
    estimatedLevel,
    categoryResults,
  };
}
