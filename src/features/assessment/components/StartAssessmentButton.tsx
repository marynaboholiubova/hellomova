"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { startAssessmentAction, type StartAssessmentActionState } from "@/features/assessment/actions";
import styles from "./AssessmentView.module.css";

async function startAction(
  _state: StartAssessmentActionState,
  _formData: FormData,
): Promise<StartAssessmentActionState> {
  return startAssessmentAction("initial_placement");
}

/**
 * Real, working start action — not a placeholder. Given no CEFR v2 item
 * content has been seeded yet for any language (a deliberate, separate,
 * human-reviewed step — see AGENTS.md), this will currently always
 * surface the honest "not available yet" message rather than silently
 * doing nothing or claiming success.
 */
export function StartAssessmentButton() {
  const [state, action, pending] = useActionState(startAction, undefined);

  return (
    <form action={action} className={styles.startForm}>
      <Button type="submit" disabled={pending} fullWidth>
        {pending ? "Checking availability..." : "Start CEFR Assessment"}
      </Button>
      {state && "error" in state && (
        <p className={styles.startMessage} role="status">
          {state.error}
        </p>
      )}
      {state && "success" in state && state.success && (
        <p className={styles.startMessage} role="status">
          Assessment started — {state.items.length} item{state.items.length === 1 ? "" : "s"} ready.
        </p>
      )}
    </form>
  );
}
