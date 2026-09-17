import "server-only";

import { openaiProvider } from "@/lib/ai/openaiProvider";
import { AiProviderError } from "@/lib/ai/provider";
import { LessonTurnResponseSchema, type LessonTurnResponse } from "@/lib/ai/lessonResponseSchema";
import { buildLessonMessages, type LessonContext, type LessonTurnRecord } from "./prompt";

export type GenerateTurnResult =
  | { success: true; data: LessonTurnResponse }
  | { success: false; errorMessage: string };

/**
 * The one place that calls the AI provider for a lesson turn, parses the
 * raw text as JSON, and validates it against LessonTurnResponseSchema.
 * Every caller (start lesson, continue lesson) goes through this — no
 * caller ever persists a response that didn't come out of here as
 * `success: true`.
 */
export async function generateLessonTurn(
  context: LessonContext,
  recentTurns: LessonTurnRecord[],
  purpose: string,
): Promise<GenerateTurnResult> {
  const messages = buildLessonMessages(context, recentTurns);

  let rawText: string;
  try {
    const result = await openaiProvider.complete({ messages, purpose });
    rawText = result.rawText;
  } catch (error) {
    if (error instanceof AiProviderError) {
      console.error("[lessons] provider error", { purpose, kind: error.kind });
      if (error.kind === "not_configured") {
        return {
          success: false,
          errorMessage:
            "The AI teacher isn't available yet — this environment doesn't have an AI provider configured.",
        };
      }
      if (error.kind === "timeout") {
        return {
          success: false,
          errorMessage: "The AI teacher took too long to respond. Please try again.",
        };
      }
    } else {
      console.error("[lessons] unexpected error generating a lesson turn", { purpose });
    }
    return {
      success: false,
      errorMessage: "The AI teacher is unavailable right now. Please try again shortly.",
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    console.error("[lessons] AI response was not valid JSON", { purpose });
    return {
      success: false,
      errorMessage: "We couldn't process the AI teacher's response. Please try again.",
    };
  }

  const validated = LessonTurnResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    console.error("[lessons] AI response failed schema validation", {
      purpose,
      issueCount: validated.error.issues.length,
    });
    return {
      success: false,
      errorMessage: "We couldn't process the AI teacher's response. Please try again.",
    };
  }

  return { success: true, data: validated.data };
}
