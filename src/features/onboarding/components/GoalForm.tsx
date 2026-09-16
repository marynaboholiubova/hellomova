"use client";

import { useActionState } from "react";
import { saveGoalAction } from "@/features/onboarding/actions";
import { GoalCard } from "./GoalCard";
import { Button } from "@/components/ui/Button";
import type { GoalOption } from "@/constants/goals";
import styles from "./OnboardingForm.module.css";
import listStyles from "./OptionList.module.css";

export interface GoalFormProps {
  goals: GoalOption[];
  defaultValue: string | null;
}

export function GoalForm({ goals, defaultValue }: GoalFormProps) {
  const [state, action, pending] = useActionState(saveGoalAction, undefined);

  return (
    <form action={action} className={styles.form}>
      <div className={listStyles.list} role="radiogroup" aria-label="Learning goal">
        {goals.map((goal) => (
          <GoalCard
            key={goal.code}
            code={goal.code}
            label={goal.label}
            name="goalCode"
            defaultChecked={goal.code === defaultValue}
          />
        ))}
      </div>
      {state?.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} fullWidth>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
