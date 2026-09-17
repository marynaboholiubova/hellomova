import * as z from "zod";

/** Only lesson mode valid in Phase 3. No CHECK constraint mirrors this in
 * the DB (see 0005_ai_lesson_engine.sql) — this Zod enum is the live gate,
 * and it grows in later phases without a migration. */
export const LessonModeSchema = z.enum(["general"]);
export type LessonMode = z.infer<typeof LessonModeSchema>;

export const LessonStatusSchema = z.enum(["active", "completed", "abandoned"]);
export type LessonStatus = z.infer<typeof LessonStatusSchema>;

const MIN_MESSAGE_LENGTH = 1;
const MAX_MESSAGE_LENGTH = 1000;

/** Learner input — the only thing ever trusted from the client for a lesson turn. */
export const LearnerMessageSchema = z
  .string()
  .trim()
  .min(MIN_MESSAGE_LENGTH, "Please write a message before sending.")
  .max(MAX_MESSAGE_LENGTH, "That message is too long — please shorten it.");

export const LessonSessionIdSchema = z.string().uuid("Invalid lesson session.");

/** Client-generated once per submit attempt; used only for idempotency, never trusted as an identity or authorization signal. */
export const ClientTurnIdSchema = z.string().uuid("Invalid request.");

export const LessonSummarySchema = z.object({
  objective: z.string().min(1).max(300),
  practiced: z.string().min(1).max(1000),
  corrections: z.array(z.string().max(300)).max(10),
  vocabulary: z.array(z.string().max(100)).max(15),
  nextStep: z.string().min(1).max(500),
});

export type LessonSummary = z.infer<typeof LessonSummarySchema>;
