import { describe, expect, it } from "vitest";
import { buildPlacementAnswersSchema } from "./schemas";
import { getPlacementBank } from "@/lib/placement/questions";

function realAnswersFor(languageCode: string) {
  const bank = getPlacementBank(languageCode);
  if (!bank) {
    throw new Error(`Expected a placement bank for "${languageCode}" in this test`);
  }
  return {
    bank,
    answers: bank.map((question) => ({
      questionId: question.id,
      optionId: question.correctOptionId,
    })),
  };
}

describe("buildPlacementAnswersSchema — validation", () => {
  it("accepts a fully answered, well-formed submission", () => {
    const { bank, answers } = realAnswersFor("en");
    const result = buildPlacementAnswersSchema(bank).safeParse(answers);
    expect(result.success).toBe(true);
  });

  it("G: a French submission cannot be graded against English question ids", () => {
    const { answers: englishAnswers } = realAnswersFor("en");
    const frenchBank = getPlacementBank("fr");
    if (!frenchBank) {
      throw new Error("Expected a French placement bank in this test");
    }

    const result = buildPlacementAnswersSchema(frenchBank).safeParse(englishAnswers);
    expect(result.success).toBe(false);
  });

  it("H: an unknown question id is rejected", () => {
    const { bank, answers } = realAnswersFor("en");
    const tampered = [...answers.slice(1), { questionId: "not-a-real-question", optionId: "a" }];

    const result = buildPlacementAnswersSchema(bank).safeParse(tampered);
    expect(result.success).toBe(false);
  });

  it("I: an unknown option id is rejected", () => {
    const { bank, answers } = realAnswersFor("en");
    const tampered = answers.map((answer, index) =>
      index === 0 ? { ...answer, optionId: "not-a-real-option" } : answer,
    );

    const result = buildPlacementAnswersSchema(bank).safeParse(tampered);
    expect(result.success).toBe(false);
  });

  it("J: duplicate answers for the same question are rejected", () => {
    const { bank, answers } = realAnswersFor("en");
    // Duplicate the first answer in place of the last, so the array is
    // still the right length but a real question id is now missing.
    const tampered = [...answers.slice(0, -1), answers[0]];

    const result = buildPlacementAnswersSchema(bank).safeParse(tampered);
    expect(result.success).toBe(false);
  });

  it("K: a submission missing answers is rejected", () => {
    const { bank, answers } = realAnswersFor("en");
    const tampered = answers.slice(0, -1);

    const result = buildPlacementAnswersSchema(bank).safeParse(tampered);
    expect(result.success).toBe(false);
  });
});
