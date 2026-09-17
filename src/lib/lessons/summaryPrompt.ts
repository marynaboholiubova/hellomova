import "server-only";

import type { AiChatMessage } from "@/lib/ai/provider";
import type { LessonContext, LessonTurnRecord } from "./prompt";

const SUMMARY_RESPONSE_FORMAT = `Respond with ONLY a single JSON object, no other text, matching exactly this shape:
{
  "objective": string,
  "practiced": string,
  "corrections": string[],
  "vocabulary": string[],
  "nextStep": string
}
This summary covers ONLY this one lesson session — do not claim anything about the learner's history across other sessions, streaks, or recurring patterns; that requires data this prompt does not give you.`;

/**
 * Builds the one-off prompt used to generate a session summary when a
 * lesson completes. Session-local only, by design — no cross-session
 * memory or "recurring mistake" claims. That is Phase 4 (Language
 * Brain) territory and is explicitly not implemented here.
 */
export function buildLessonSummaryMessages(
  context: LessonContext,
  turns: LessonTurnRecord[],
): AiChatMessage[] {
  const transcript = turns
    .map((turn) => `${turn.role === "teacher" ? context.teacher.name : "Learner"}: ${turn.content}`)
    .join("\n");

  return [
    {
      role: "system",
      content: [
        `You are ${context.teacher.name}, summarizing a single completed ${context.targetLanguageName} lesson for the learner. Write the summary in ${context.nativeLanguageName} where that helps clarity, but keep vocabulary examples in ${context.targetLanguageName}.`,
        "Summarize ONLY what happened in the transcript below — do not invent mistakes, vocabulary, or progress that isn't actually in it.",
        SUMMARY_RESPONSE_FORMAT,
      ].join("\n\n"),
    },
    {
      role: "user",
      content: `Lesson transcript:\n${transcript}`,
    },
  ];
}
