"use client";

import { useActionState } from "react";
import { startLessonAction } from "@/features/lessons/actions";
import { Button } from "@/components/ui/Button";
import styles from "./StartLessonButton.module.css";

export interface StartLessonButtonProps {
  /**
   * Which learning mode to start — validated server-side against
   * LearningModeIdSchema in startLessonAction; an unavailable/unknown
   * value is rejected there, never trusted just because it was sent.
   * Defaults to "general", the one mode that exists today, so every
   * pre-Phase-7 call site keeps working unchanged.
   */
  modeId?: string;
  label?: string;
}

export function StartLessonButton({ modeId = "general", label = "Start lesson" }: StartLessonButtonProps) {
  const [state, action, pending] = useActionState(startLessonAction, undefined);

  return (
    <form action={action}>
      <input type="hidden" name="mode" value={modeId} />
      {state?.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} fullWidth>
        {pending ? "Starting…" : label}
      </Button>
    </form>
  );
}
