import { MAX_REVIEW_STAGE, SPACED_REPETITION_STAGE_INTERVAL_DAYS } from "./constants";

export type ReviewResult = "again" | "good";

export interface ReviewOutcome {
  newStage: number;
  newDueAt: Date;
  /**
   * 100 once an item has passed a review AT the final stage (real
   * evidence of retention over the full 1d→3d→7d→30d schedule); null
   * otherwise, including immediately after any failed review — a lapse
   * means mastery has to be re-earned, not silently kept.
   */
  newMasteryScore: number | null;
}

/**
 * The fixed initial review schedule (AGENTS.md Section 11):
 * stage 1 → due +1 day, stage 2 → +3 days, stage 3 → +1 week,
 * stage 4 → +30 days (steady-state maintenance interval once mastered).
 *
 * Failed review ("again") always resets to stage 1 / +1 day, regardless
 * of the current stage — a full restart of the schedule, which is the
 * simplest real rule that avoids silently keeping credit for retention
 * that evidently didn't hold. This is deliberately not SM-2 or any
 * adaptive-interval algorithm (AGENTS.md Section 11 asks for exactly
 * this fixed schedule, not more).
 */
export function computeNextReview(
  currentStage: number,
  result: ReviewResult,
  now: Date = new Date(),
): ReviewOutcome {
  if (currentStage < 1 || currentStage > MAX_REVIEW_STAGE) {
    throw new Error(`computeNextReview: currentStage out of range: ${currentStage}`);
  }

  if (result === "again") {
    return {
      newStage: 1,
      newDueAt: addDays(now, SPACED_REPETITION_STAGE_INTERVAL_DAYS[1]),
      newMasteryScore: null,
    };
  }

  const newStage = Math.min(currentStage + 1, MAX_REVIEW_STAGE);
  return {
    newStage,
    newDueAt: addDays(now, SPACED_REPETITION_STAGE_INTERVAL_DAYS[newStage]),
    newMasteryScore: newStage === MAX_REVIEW_STAGE ? 100 : null,
  };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
