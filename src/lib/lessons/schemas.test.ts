import { describe, expect, it } from "vitest";
import {
  LearnerMessageSchema,
  LessonSessionIdSchema,
  ClientTurnIdSchema,
  LessonSummarySchema,
} from "./schemas";

describe("LearnerMessageSchema", () => {
  it("F: rejects an empty message", () => {
    expect(LearnerMessageSchema.safeParse("").success).toBe(false);
    expect(LearnerMessageSchema.safeParse("   ").success).toBe(false);
  });

  it("G: rejects an oversized message", () => {
    const tooLong = "a".repeat(1001);
    expect(LearnerMessageSchema.safeParse(tooLong).success).toBe(false);
  });

  it("accepts and trims a reasonable message", () => {
    const result = LearnerMessageSchema.safeParse("  Hello there  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("Hello there");
    }
  });

  it("rejects non-string input", () => {
    expect(LearnerMessageSchema.safeParse(null).success).toBe(false);
    expect(LearnerMessageSchema.safeParse(42).success).toBe(false);
  });
});

describe("LessonSessionIdSchema / ClientTurnIdSchema", () => {
  it("rejects a non-uuid session id", () => {
    expect(LessonSessionIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(LessonSessionIdSchema.safeParse(null).success).toBe(false);
  });

  it("accepts a real uuid", () => {
    expect(LessonSessionIdSchema.safeParse("123e4567-e89b-12d3-a456-426614174000").success).toBe(
      true,
    );
  });

  it("rejects a non-uuid client turn id", () => {
    expect(ClientTurnIdSchema.safeParse("abc").success).toBe(false);
  });
});

describe("LessonSummarySchema — L: session summary schema validation", () => {
  it("accepts a well-formed summary", () => {
    const result = LessonSummarySchema.safeParse({
      objective: "Practice ordering food",
      practiced: "Ordering at a restaurant",
      corrections: ["Use 'un' not 'une' before 'café'"],
      vocabulary: ["l'addition", "commander"],
      nextStep: "Try describing your favorite meal next time",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a summary missing a required field", () => {
    const result = LessonSummarySchema.safeParse({
      objective: "Practice ordering food",
      practiced: "Ordering at a restaurant",
      corrections: [],
      vocabulary: [],
      // nextStep missing
    });
    expect(result.success).toBe(false);
  });

  it("rejects a summary with the wrong types", () => {
    const result = LessonSummarySchema.safeParse({
      objective: "Practice ordering food",
      practiced: "Ordering at a restaurant",
      corrections: "not an array",
      vocabulary: [],
      nextStep: "Next time",
    });
    expect(result.success).toBe(false);
  });
});
