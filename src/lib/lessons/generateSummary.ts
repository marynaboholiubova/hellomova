import "server-only";

import { openaiProvider } from "@/lib/ai/openaiProvider";
import { AiProviderError } from "@/lib/ai/provider";
import { LessonSummarySchema, type LessonSummary } from "./schemas";
import { buildLessonSummaryMessages } from "./summaryPrompt";
import type { LessonContext, LessonTurnRecord } from "./prompt";

export type GenerateSummaryResult =
  | { success: true; data: LessonSummary }
  | { success: false };

/**
 * Best-effort: a lesson's completion is decided by the main turn call's
 * validated `shouldComplete` flag, not by this succeeding. If this fails,
 * the session still completes with `summary = null` rather than blocking
 * completion on a second AI call.
 */
export async function generateLessonSummary(
  context: LessonContext,
  turns: LessonTurnRecord[],
): Promise<GenerateSummaryResult> {
  const messages = buildLessonSummaryMessages(context, turns);

  let rawText: string;
  try {
    const result = await openaiProvider.complete({ messages, purpose: "lesson_summary" });
    rawText = result.rawText;
  } catch (error) {
    if (error instanceof AiProviderError) {
      console.error("[lessons] summary provider error", { kind: error.kind });
    } else {
      console.error("[lessons] unexpected error generating a summary");
    }
    return { success: false };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    console.error("[lessons] summary response was not valid JSON");
    return { success: false };
  }

  const validated = LessonSummarySchema.safeParse(parsedJson);
  if (!validated.success) {
    console.error("[lessons] summary response failed schema validation", {
      issueCount: validated.error.issues.length,
    });
    return { success: false };
  }

  return { success: true, data: validated.data };
}
