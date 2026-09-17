import * as z from "zod";

/**
 * The only shape a lesson turn from the AI provider is ever trusted in.
 * Parsed server-side on every call — see src/lib/ai/openaiProvider.ts and
 * src/features/lessons/actions.ts. A response that fails this schema is
 * rejected outright: nothing malformed is ever persisted as lesson state,
 * and nothing here is ever taken from the client.
 */
export const LessonTurnResponseSchema = z.object({
  teacherMessage: z.string().min(1).max(4000),
  correction: z.object({
    hasCorrection: z.boolean(),
    original: z.string().nullable(),
    corrected: z.string().nullable(),
    explanation: z.string().nullable(),
  }),
  lessonState: z.object({
    objective: z.string().min(1).max(300),
    turnType: z.enum(["introduction", "practice", "wrap_up"]),
    shouldComplete: z.boolean(),
  }),
});

export type LessonTurnResponse = z.infer<typeof LessonTurnResponseSchema>;
