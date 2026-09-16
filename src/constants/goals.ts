export interface GoalOption {
  code: string;
  label: string;
}

/** Exactly the planned goal set — do not add or rename entries. */
export const GOALS: GoalOption[] = [
  { code: "general", label: "General" },
  { code: "travel", label: "Travel" },
  { code: "work", label: "Work" },
  { code: "business", label: "Business" },
  { code: "job_interview", label: "Job Interview" },
  { code: "study", label: "Study" },
  { code: "relocation", label: "Relocation" },
];

export function getGoalByCode(code: string): GoalOption | undefined {
  return GOALS.find((goal) => goal.code === code);
}

export const GOAL_CODES: string[] = GOALS.map((goal) => goal.code);
