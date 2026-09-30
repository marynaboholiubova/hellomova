import * as z from "zod";
import { CefrLevelSchema } from "@/lib/onboarding/schemas";
import {
  ASSESSMENT_SKILLS,
  ASSESSMENT_TYPES,
  ITEM_TYPES,
  BRIDGE_PLAN_TARGET_SOURCE_TYPES,
} from "./constants";

export { CefrLevelSchema };

export const AssessmentSkillSchema = z.enum(ASSESSMENT_SKILLS);
export const AssessmentTypeSchema = z.enum(ASSESSMENT_TYPES);
export const ItemTypeSchema = z.enum(ITEM_TYPES);
export const BridgePlanTargetSourceTypeSchema = z.enum(BRIDGE_PLAN_TARGET_SOURCE_TYPES);

/** Client-safe MCQ option shape — never carries which one is correct. */
export const McqOptionSchema = z.object({
  id: z.string().min(1).max(20),
  label: z.string().min(1).max(300),
});

/** The trusted shape of an assessment_item_versions.prompt column for a
 * multiple_choice item. Validated on write (authoring) and on read
 * (before ever handing content to a Server Component / client). */
export const McqPromptSchema = z.object({
  text: z.string().min(1).max(1000),
  options: z.array(McqOptionSchema).min(2).max(6),
});
export type McqPrompt = z.infer<typeof McqPromptSchema>;

/** assessment_item_versions.answer_key for a multiple_choice item —
 * NEVER sent to the client; read only server-side. */
export const McqAnswerKeySchema = z.object({
  correctOptionId: z.string().min(1).max(20),
});
export type McqAnswerKey = z.infer<typeof McqAnswerKeySchema>;

/** The trusted shape of a writing_prompt item's prompt column. */
export const WritingPromptSchema = z.object({
  text: z.string().min(1).max(1000),
  minWords: z.number().int().min(0).max(2000).optional(),
  maxWords: z.number().int().min(1).max(5000).optional(),
});
export type WritingPromptContent = z.infer<typeof WritingPromptSchema>;

/** Public (client-safe) item shape — mirrors
 * src/lib/placement/questions.ts's toPublicQuestion(): a prompt an
 * unauthenticated-of-the-answer browser may see, never an answer key. */
export const PublicAssessmentItemSchema = z.object({
  responseId: z.string().uuid(),
  itemType: ItemTypeSchema,
  skill: AssessmentSkillSchema,
  prompt: z.union([McqPromptSchema, WritingPromptSchema]),
});
export type PublicAssessmentItem = z.infer<typeof PublicAssessmentItemSchema>;

/** The one thing the browser may legitimately submit for an MCQ answer:
 * which response slot, and which option it picked. Never a correctness
 * claim, never a skill score, never a level. */
export const RecordMcqResponseSchema = z.object({
  responseId: z.string().uuid("Invalid response."),
  selectedOptionId: z.string().min(1).max(20),
});

/** The one thing the browser may legitimately submit for a writing
 * answer: which response slot, and the free-text answer itself — treated
 * as untrusted content, never instructions (see writingEvaluation.ts). */
export const RecordWritingResponseSchema = z.object({
  responseId: z.string().uuid("Invalid response."),
  writtenResponse: z.string().trim().min(1, "Please write a response.").max(5000),
});

export const AssessmentIdSchema = z.string().uuid("Invalid assessment.");

/** Rubric criteria definition — fixed, versioned, never ad hoc. Matches
 * AGENTS.md Section 15's five criteria. */
export const WritingRubricCriterionSchema = z.object({
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
});
export const WritingRubricCriteriaSchema = z.array(WritingRubricCriterionSchema).min(1).max(10);
export type WritingRubricCriterion = z.infer<typeof WritingRubricCriterionSchema>;

/**
 * AI-produced writing evaluation output. Structured, Zod-validated,
 * schema-bound to the rubric's own criterion keys (validated by the
 * caller after parsing — see writingEvaluation.ts) so the model cannot
 * invent a criterion, a different scoring scale, or anything beyond
 * per-criterion evidence. The AI never outputs a CEFR level, a pass/fail
 * verdict, or an ownership/user id — those are never even asked for.
 */
export const WritingEvaluationCriterionResultSchema = z.object({
  criterion: z.string().min(1).max(60),
  score: z.number().min(0).max(100),
  evidence: z.string().min(1).max(500),
});
export const WritingEvaluationOutputSchema = z.object({
  criterionResults: z.array(WritingEvaluationCriterionResultSchema).min(1).max(10),
});
export type WritingEvaluationOutput = z.infer<typeof WritingEvaluationOutputSchema>;
