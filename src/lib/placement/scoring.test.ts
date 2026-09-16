import { describe, expect, it } from "vitest";
import { scorePlacementTest, type PlacementAnswer } from "./scoring";
import { getPlacementBank, type PlacementQuestion } from "./questions";
import { EN_PLACEMENT_BANK } from "./banks/en";
import type { CefrLevel } from "@/lib/onboarding/schemas";

/**
 * Builds a deterministic answer set from a real bank: every question at
 * one of `passLevels` gets its real correct answer; every other question
 * gets a deliberately wrong (but valid) option. This exercises the real
 * production content (banks/en.ts), not a synthetic fixture.
 */
function buildAnswers(bank: PlacementQuestion[], passLevels: CefrLevel[]): PlacementAnswer[] {
  return bank.map((question) => {
    if (passLevels.includes(question.level)) {
      return { questionId: question.id, optionId: question.correctOptionId };
    }
    const wrongOption = question.options.find((option) => option.id !== question.correctOptionId);
    if (!wrongOption) {
      throw new Error(`Question ${question.id} has no incorrect option to use as a fixture`);
    }
    return { questionId: question.id, optionId: wrongOption.id };
  });
}

describe("scorePlacementTest — evidence-gated leveling", () => {
  // getPlacementBank("en") is the bank actually served to real users:
  // A1–C1 only (C2 items filtered out — see MAX_SERVED_LEVEL).
  const bank = getPlacementBank("en");
  if (!bank) {
    throw new Error("English placement bank must exist for these tests");
  }

  it("A: passes A1, fails A2 -> A1", () => {
    const result = scorePlacementTest(bank, buildAnswers(bank, ["A1"]));
    expect(result.estimatedLevel).toBe("A1");
  });

  it("B: passes A1+A2, fails B1 -> A2", () => {
    const result = scorePlacementTest(bank, buildAnswers(bank, ["A1", "A2"]));
    expect(result.estimatedLevel).toBe("A2");
  });

  it("C: passes through B1, fails B2 -> B1", () => {
    const result = scorePlacementTest(bank, buildAnswers(bank, ["A1", "A2", "B1"]));
    expect(result.estimatedLevel).toBe("B1");
  });

  it("D: passes through B2, fails C1 -> B2", () => {
    const result = scorePlacementTest(bank, buildAnswers(bank, ["A1", "A2", "B1", "B2"]));
    expect(result.estimatedLevel).toBe("B2");
  });

  it("E: passes through C1 -> C1", () => {
    const result = scorePlacementTest(bank, buildAnswers(bank, ["A1", "A2", "B1", "B2", "C1"]));
    expect(result.estimatedLevel).toBe("C1");
  });

  it("F: easy/A1-only success can never produce C1 or C2", () => {
    const result = scorePlacementTest(bank, buildAnswers(bank, ["A1"]));
    expect(result.estimatedLevel).not.toBe("C1");
    expect(result.estimatedLevel).not.toBe("C2");
    expect(result.estimatedLevel).toBe("A1");
  });

  it("caps at C1 even when every item (including raw C2 items) is answered correctly", () => {
    // Uses the RAW, unfiltered 18-item bank directly — bypassing
    // getPlacementBank()'s own C2 filter — to prove the cap is enforced
    // independently inside scorePlacementTest itself (defense in depth),
    // not only by what gets served to the UI.
    const allLevels: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
    const result = scorePlacementTest(EN_PLACEMENT_BANK, buildAnswers(EN_PLACEMENT_BANK, allLevels));
    expect(result.estimatedLevel).toBe("C1");
  });

  it("no answers at all -> floor of A1, not a higher level", () => {
    const result = scorePlacementTest(bank, []);
    expect(result.estimatedLevel).toBe("A1");
    expect(result.score).toBe(0);
  });
});
