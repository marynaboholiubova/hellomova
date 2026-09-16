import * as z from "zod";
import { LANGUAGE_CODES } from "@/constants/languages";
import { GOAL_CODES } from "@/constants/goals";
import { TEACHER_IDS } from "@/constants/teachers";
import type { PlacementQuestion } from "@/lib/placement/questions";

export const CefrLevelSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
export type CefrLevel = z.infer<typeof CefrLevelSchema>;

/** Rejects any code not in the current language catalog — never a free string. */
export const LanguageCodeSchema = z
  .string()
  .refine((code) => LANGUAGE_CODES.includes(code), "Unknown language.");

export const GoalCodeSchema = z
  .string()
  .refine((code) => GOAL_CODES.includes(code), "Unknown goal.");

export const TeacherIdSchema = z
  .string()
  .refine((id) => TEACHER_IDS.includes(id), "Unknown teacher.");

/**
 * Placement answer validation is scoped to a specific target-language
 * bank, resolved at request time — there is no longer one fixed question
 * set to validate against at module load. Build a fresh schema with the
 * bank that matches the caller's actual primary target language.
 */
export function buildPlacementAnswerSchema(bank: PlacementQuestion[]) {
  const knownQuestionIds = new Set(bank.map((question) => question.id));
  const validOptionIdsByQuestion = new Map(
    bank.map((question) => [question.id, new Set(question.options.map((option) => option.id))]),
  );

  return z
    .object({
      questionId: z.string(),
      optionId: z.string(),
    })
    .refine((answer) => knownQuestionIds.has(answer.questionId), "Unknown question.")
    .refine(
      (answer) => validOptionIdsByQuestion.get(answer.questionId)?.has(answer.optionId) ?? false,
      "Unknown answer option.",
    );
}

export function buildPlacementAnswersSchema(bank: PlacementQuestion[]) {
  return z
    .array(buildPlacementAnswerSchema(bank))
    .length(bank.length, "Please answer every question.")
    .refine(
      (answers) => new Set(answers.map((answer) => answer.questionId)).size === answers.length,
      "Duplicate answers for the same question.",
    );
}

/** Validates the shape read back out of placement_test_attempts.category_breakdown. */
export const PlacementCategoryResultSchema = z.object({
  category: z.enum(["vocabulary", "grammar", "reading"]),
  correct: z.number(),
  total: z.number(),
  percentage: z.number(),
});

export const PlacementCategoryResultsSchema = z.array(PlacementCategoryResultSchema);
