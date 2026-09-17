import { describe, expect, it } from "vitest";
import { LessonTurnResponseSchema } from "./lessonResponseSchema";

const VALID_RESPONSE = {
  teacherMessage: "Bonjour ! Comment allez-vous aujourd'hui ?",
  correction: {
    hasCorrection: false,
    original: null,
    corrected: null,
    explanation: null,
  },
  lessonState: {
    objective: "Practice greetings",
    turnType: "introduction",
    shouldComplete: false,
  },
};

describe("LessonTurnResponseSchema — H: malformed AI structured output rejected", () => {
  it("accepts a well-formed response", () => {
    expect(LessonTurnResponseSchema.safeParse(VALID_RESPONSE).success).toBe(true);
  });

  it("rejects a response missing teacherMessage", () => {
    const { teacherMessage, ...rest } = VALID_RESPONSE;
    void teacherMessage;
    expect(LessonTurnResponseSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an invalid turnType", () => {
    const malformed = {
      ...VALID_RESPONSE,
      lessonState: { ...VALID_RESPONSE.lessonState, turnType: "not_a_real_type" },
    };
    expect(LessonTurnResponseSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects shouldComplete as a string instead of a boolean", () => {
    const malformed = {
      ...VALID_RESPONSE,
      lessonState: { ...VALID_RESPONSE.lessonState, shouldComplete: "false" },
    };
    expect(LessonTurnResponseSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects plain free-form text (not even an object)", () => {
    expect(LessonTurnResponseSchema.safeParse("Sure, here's your lesson!").success).toBe(false);
  });

  it("rejects a correction object with the wrong shape", () => {
    const malformed = { ...VALID_RESPONSE, correction: { hasCorrection: true } };
    expect(LessonTurnResponseSchema.safeParse(malformed).success).toBe(false);
  });
});
