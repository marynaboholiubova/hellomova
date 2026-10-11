import "server-only";

import { openaiAudioProvider } from "@/lib/ai/openaiAudioProvider";
import { AudioProviderError } from "@/lib/ai/audioProvider";
import { openaiProvider } from "@/lib/ai/openaiProvider";
import { AiProviderError } from "@/lib/ai/provider";
import {
  PronunciationModelOutputSchema,
  PRONUNCIATION_EVALUATION_LIMITATIONS,
  type PronunciationEvaluation,
} from "./schemas";
import { buildEvaluationMessages, type PronunciationEvaluationContext } from "./prompt";

export type TranscribeResult =
  | { success: true; transcript: string; model: string }
  | { success: false; errorMessage: string };

/** The one place that sends a learner's recording to the transcription provider. */
export async function transcribeAttemptAudio(audio: Blob): Promise<TranscribeResult> {
  try {
    const result = await openaiAudioProvider.transcribe({ audio, purpose: "pronunciation_attempt" });
    return { success: true, transcript: result.transcript, model: result.model };
  } catch (error) {
    if (error instanceof AudioProviderError) {
      console.error("[pronunciation] transcription provider error", { kind: error.kind });
      if (error.kind === "not_configured") {
        return { success: false, errorMessage: "Pronunciation practice isn't available yet — this environment doesn't have an AI provider configured." };
      }
      if (error.kind === "timeout") {
        return { success: false, errorMessage: "The pronunciation check took too long. Please try again." };
      }
      if (error.kind === "unsupported_audio") {
        return { success: false, errorMessage: "That recording's format couldn't be processed. Please try recording again." };
      }
    } else {
      console.error("[pronunciation] unexpected error transcribing audio");
    }
    return { success: false, errorMessage: "Couldn't process your recording right now. Please try again shortly." };
  }
}

export type EvaluateResult =
  | { success: true; data: PronunciationEvaluation; model: string }
  | { success: false; errorMessage: string };

/** The one place that asks the AI provider to evaluate a transcript against the target phrase. */
export async function evaluatePronunciationTranscript(context: PronunciationEvaluationContext): Promise<EvaluateResult> {
  const messages = buildEvaluationMessages(context);
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  let rawText: string;
  try {
    const result = await openaiProvider.complete({ messages, purpose: "pronunciation_evaluation" });
    rawText = result.rawText;
  } catch (error) {
    if (error instanceof AiProviderError) {
      console.error("[pronunciation] evaluation provider error", { kind: error.kind });
      if (error.kind === "not_configured") {
        return { success: false, errorMessage: "Pronunciation practice isn't available yet — this environment doesn't have an AI provider configured." };
      }
      if (error.kind === "timeout") {
        return { success: false, errorMessage: "The pronunciation check took too long. Please try again." };
      }
    } else {
      console.error("[pronunciation] unexpected error evaluating transcript");
    }
    return { success: false, errorMessage: "Couldn't evaluate your recording right now. Please try again shortly." };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    console.error("[pronunciation] evaluation response was not valid JSON");
    return { success: false, errorMessage: "Couldn't evaluate your recording right now. Please try again." };
  }

  // Only the fields a text comparison can honestly support are parsed
  // from the MODEL's own output — see PronunciationModelOutputSchema.
  const validated = PronunciationModelOutputSchema.safeParse(parsedJson);
  if (!validated.success) {
    console.error("[pronunciation] evaluation response failed schema validation", { issueCount: validated.error.issues.length });
    return { success: false, errorMessage: "Couldn't evaluate your recording right now. Please try again." };
  }

  // `recognizedTranscript` and `limitations` are SERVER-SET, never parsed
  // from the model's JSON — see schemas.ts for why this must be
  // structural rather than relying on the model to self-report honestly.
  const data: PronunciationEvaluation = {
    ...validated.data,
    recognizedTranscript: context.transcript,
    limitations: PRONUNCIATION_EVALUATION_LIMITATIONS,
  };

  return { success: true, data, model };
}
