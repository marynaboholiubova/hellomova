import { describe, expect, it } from "vitest";
import { isSkillEvidencePassing, computeSkillRawScore, computeWritingRawScore, resolveSkillEstimatedLevel } from "./scoring";

describe("isSkillEvidencePassing — mirrors placement v1's 2/3 threshold exactly", () => {
  it("passes at exactly 2/3", () => {
    expect(isSkillEvidencePassing({ administered: 3, correct: 2 })).toBe(true);
  });

  it("fails below 2/3", () => {
    expect(isSkillEvidencePassing({ administered: 3, correct: 1 })).toBe(false);
  });

  it("D/F: a single item's evidence still resolves deterministically (never a coin flip)", () => {
    expect(isSkillEvidencePassing({ administered: 1, correct: 1 })).toBe(true);
    expect(isSkillEvidencePassing({ administered: 1, correct: 0 })).toBe(false);
  });

  it("throws rather than fabricating a result with zero administered items", () => {
    expect(() => isSkillEvidencePassing({ administered: 0, correct: 0 })).toThrow();
  });

  it("throws on an internally inconsistent evidence pair", () => {
    expect(() => isSkillEvidencePassing({ administered: 2, correct: 3 })).toThrow();
    expect(() => isSkillEvidencePassing({ administered: 2, correct: -1 })).toThrow();
  });
});

describe("computeSkillRawScore — descriptive percentage, never a CEFR level", () => {
  it("computes an exact percentage", () => {
    expect(computeSkillRawScore({ administered: 4, correct: 3 })).toBe(75);
  });

  it("rounds to two decimal places", () => {
    expect(computeSkillRawScore({ administered: 3, correct: 1 })).toBeCloseTo(33.33, 2);
  });

  it("throws with zero administered items", () => {
    expect(() => computeSkillRawScore({ administered: 0, correct: 0 })).toThrow();
  });
});

describe("resolveSkillEstimatedLevel — never depends on row order, never guesses across mixed bands", () => {
  it("same skill, same band: resolves the band when evidence passes", () => {
    expect(resolveSkillEstimatedLevel({ administered: 3, correct: 2 }, ["B1", "B1", "B1"])).toBe("B1");
  });

  it("same skill, same band: returns null when evidence fails the threshold", () => {
    expect(resolveSkillEstimatedLevel({ administered: 3, correct: 1 }, ["B1", "B1", "B1"])).toBeNull();
  });

  it("same skill, multiple CEFR bands: never resolves a single level, even with perfect evidence", () => {
    expect(resolveSkillEstimatedLevel({ administered: 4, correct: 4 }, ["B1", "B1", "B2", "B2"])).toBeNull();
  });

  it("row-order independence: shuffling which band is listed first/last never changes the result", () => {
    const ordering1 = resolveSkillEstimatedLevel({ administered: 3, correct: 2 }, ["A2", "B1", "A2"]);
    const ordering2 = resolveSkillEstimatedLevel({ administered: 3, correct: 2 }, ["A2", "A2", "B1"]);
    const ordering3 = resolveSkillEstimatedLevel({ administered: 3, correct: 2 }, ["B1", "A2", "A2"]);
    // All three orderings represent the SAME mixed-band evidence (two
    // distinct bands present) — the result must be null regardless of
    // which order the bands were observed/listed in.
    expect(ordering1).toBeNull();
    expect(ordering2).toBeNull();
    expect(ordering3).toBeNull();
  });

  it("a single band repeated many times still resolves deterministically regardless of order", () => {
    const forward = resolveSkillEstimatedLevel({ administered: 3, correct: 3 }, ["C1", "C1", "C1"]);
    const shuffled = resolveSkillEstimatedLevel({ administered: 3, correct: 3 }, ["C1", "C1", "C1"].reverse());
    expect(forward).toBe("C1");
    expect(shuffled).toBe("C1");
  });
});

describe("computeWritingRawScore — a within-skill mean across rubric criteria, never a cross-skill average", () => {
  it("averages criterion scores", () => {
    const result = computeWritingRawScore([
      { criterion: "task_achievement", score: 80 },
      { criterion: "grammar_range_accuracy", score: 60 },
    ]);
    expect(result).toBe(70);
  });

  it("throws with no criterion scores", () => {
    expect(() => computeWritingRawScore([])).toThrow();
  });
});
