"use client";

import { useActionState } from "react";
import { startLessonAction } from "@/features/lessons/actions";
import { Button } from "@/components/ui/Button";
import styles from "./StartLessonButton.module.css";

export function StartLessonButton() {
  const [state, action, pending] = useActionState(startLessonAction, undefined);

  return (
    <form action={action}>
      {state?.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} fullWidth>
        {pending ? "Starting…" : "Start lesson"}
      </Button>
    </form>
  );
}
