import type { PronunciationEvaluation } from "@/lib/pronunciation/schemas";

export type StartPronunciationActionState =
  | { error: string }
  | { success: true; attemptId: string; targetText: string }
  | undefined;

export type SubmitPronunciationActionState =
  | { error: string }
  | { success: true; status: "completed"; transcript: string; evaluation: PronunciationEvaluation }
  | { success: true; status: "failed"; errorReason: string }
  | undefined;
