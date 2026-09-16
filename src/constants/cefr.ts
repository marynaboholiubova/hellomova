import type { CefrLevel } from "@/lib/onboarding/schemas";

/** Friendly names for the standard CEFR levels, for display only. */
export const CEFR_LABELS: Record<CefrLevel, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Proficient",
};
