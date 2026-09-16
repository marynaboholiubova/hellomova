import type { CefrLevel } from "@/lib/onboarding/schemas";

const CEFR_ORDER: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

const GOAL_FOCUS: Record<string, string> = {
  general: "Everyday vocabulary and confident basic conversation.",
  travel: "Practical phrases for airports, hotels, and getting around.",
  work: "Everyday workplace communication and email phrases.",
  business: "Professional vocabulary, meetings, and formal writing.",
  job_interview: "Interview phrasing, describing experience, and common questions.",
  study: "Academic vocabulary and reading comprehension.",
  relocation: "Daily-life vocabulary for living, paperwork, and settling in.",
};

export interface PersonalPlan {
  currentLevel: CefrLevel;
  nextLevel: CefrLevel;
  focus: string;
  minutesPerDay: number;
  daysPerWeek: number;
}

/**
 * Deterministic plan summary built only from already-known onboarding
 * data (target language handled by the caller, CEFR level, goal). No AI.
 * The rhythm is a fixed, universal MVP default rather than an invented
 * per-goal curriculum — Phase 3+ can make it adaptive.
 */
export function generatePersonalPlan(cefrLevel: CefrLevel, goalCode: string): PersonalPlan {
  const currentIndex = CEFR_ORDER.indexOf(cefrLevel);
  const nextLevel = CEFR_ORDER[Math.min(currentIndex + 1, CEFR_ORDER.length - 1)];

  return {
    currentLevel: cefrLevel,
    nextLevel,
    focus: GOAL_FOCUS[goalCode] ?? GOAL_FOCUS.general,
    minutesPerDay: 20,
    daysPerWeek: 5,
  };
}
