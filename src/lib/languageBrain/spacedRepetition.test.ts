import { describe, expect, it } from "vitest";
import { computeNextReview } from "./spacedRepetition";

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z");

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

describe("computeNextReview — I: fixed 1d -> 3d -> 7d -> 30d schedule", () => {
  it("stage 1 -> 2 on a successful review is due in 3 days", () => {
    const outcome = computeNextReview(1, "good", FIXED_NOW);
    expect(outcome.newStage).toBe(2);
    expect(daysBetween(FIXED_NOW, outcome.newDueAt)).toBe(3);
    expect(outcome.newMasteryScore).toBeNull();
  });

  it("stage 2 -> 3 on a successful review is due in 7 days", () => {
    const outcome = computeNextReview(2, "good", FIXED_NOW);
    expect(outcome.newStage).toBe(3);
    expect(daysBetween(FIXED_NOW, outcome.newDueAt)).toBe(7);
    expect(outcome.newMasteryScore).toBeNull();
  });

  it("stage 3 -> 4 on a successful review is due in 30 days and marks mastery", () => {
    const outcome = computeNextReview(3, "good", FIXED_NOW);
    expect(outcome.newStage).toBe(4);
    expect(daysBetween(FIXED_NOW, outcome.newDueAt)).toBe(30);
    expect(outcome.newMasteryScore).toBe(100);
  });

  it("stage 4 stays at stage 4 (steady-state maintenance interval) and keeps mastery", () => {
    const outcome = computeNextReview(4, "good", FIXED_NOW);
    expect(outcome.newStage).toBe(4);
    expect(daysBetween(FIXED_NOW, outcome.newDueAt)).toBe(30);
    expect(outcome.newMasteryScore).toBe(100);
  });

  it("a brand-new item's first schedule is +1 day (asserted at stage 1, mirrors insert-time default)", () => {
    // computeNextReview isn't called for the initial insert (the schema
    // default handles it — see 0006_language_brain.sql) but stage 1's own
    // interval must still be exactly 1 day for consistency.
    const outcome = computeNextReview(1, "again", FIXED_NOW);
    expect(daysBetween(FIXED_NOW, outcome.newDueAt)).toBe(1);
  });
});

describe("computeNextReview — J: failed review resets to stage 1", () => {
  it("resets from stage 3 to stage 1 / +1 day on a failed review", () => {
    const outcome = computeNextReview(3, "again", FIXED_NOW);
    expect(outcome.newStage).toBe(1);
    expect(daysBetween(FIXED_NOW, outcome.newDueAt)).toBe(1);
  });

  it("clears mastery on a failed review even from the final stage", () => {
    const outcome = computeNextReview(4, "again", FIXED_NOW);
    expect(outcome.newStage).toBe(1);
    expect(outcome.newMasteryScore).toBeNull();
  });
});

describe("computeNextReview — input validation", () => {
  it("rejects an out-of-range current stage", () => {
    expect(() => computeNextReview(0, "good")).toThrow();
    expect(() => computeNextReview(5, "good")).toThrow();
  });
});
