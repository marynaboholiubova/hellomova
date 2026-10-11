import "server-only";

import { openaiProvider } from "@/lib/ai/openaiProvider";
import { AiProviderError } from "@/lib/ai/provider";
import { TargetPhraseResponseSchema, type TargetPhraseResponse } from "./schemas";
import { buildPhraseGenerationMessages, type PronunciationPhraseContext } from "./prompt";

export type GeneratePhraseResult =
  | { success: true; data: TargetPhraseResponse }
  | { success: false; errorMessage: string };

/** The one place that asks the AI provider for a pronunciation target phrase. */
export async function generateTargetPhrase(context: PronunciationPhraseContext): Promise<GeneratePhraseResult> {
  const messages = buildPhraseGenerationMessages(context);

  let rawText: string;
  try {
    const result = await openaiProvider.complete({ messages, purpose: "pronunciation_phrase" });
    rawText = result.rawText;
  } catch (error) {
    if (error instanceof AiProviderError) {
      console.error("[pronunciation] phrase generation provider error", { kind: error.kind });
      if (error.kind === "not_configured") {
        return { success: false, errorMessage: "Pronunciation practice isn't available yet — this environment doesn't have an AI provider configured." };
      }
      if (error.kind === "timeout") {
        return { success: false, errorMessage: "The AI teacher took too long to respond. Please try again." };
      }
    } else {
      console.error("[pronunciation] unexpected error generating a target phrase");
    }
    return { success: false, errorMessage: "Couldn't prepare a pronunciation phrase right now. Please try again shortly." };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    console.error("[pronunciation] phrase response was not valid JSON");
    return { success: false, errorMessage: "Couldn't prepare a pronunciation phrase right now. Please try again." };
  }

  const validated = TargetPhraseResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    console.error("[pronunciation] phrase response failed schema validation", { issueCount: validated.error.issues.length });
    return { success: false, errorMessage: "Couldn't prepare a pronunciation phrase right now. Please try again." };
  }

  return { success: true, data: validated.data };
}
