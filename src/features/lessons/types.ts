import type { LessonSummary } from "@/lib/lessons/schemas";

export type LessonActionState = { error?: string } | undefined;

export interface LessonCorrection {
  hasCorrection: boolean;
  original: string | null;
  corrected: string | null;
  explanation: string | null;
}

export type SendMessageActionState =
  | { error: string }
  | {
      success: true;
      teacherMessage: string;
      correction: LessonCorrection;
      sessionStatus: "active" | "completed";
      summary: LessonSummary | null;
    }
  | undefined;
