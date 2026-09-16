import styles from "./StepProgress.module.css";

export interface StepProgressProps {
  currentStepNumber: number;
  totalSteps: number;
  label: string;
}

/** Thin segmented progress bar, matching design-references/onboarding. */
export function StepProgress({ currentStepNumber, totalSteps, label }: StepProgressProps) {
  const percent = Math.round((currentStepNumber / totalSteps) * 100);

  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={totalSteps}
      aria-valuenow={currentStepNumber}
      aria-label={`Step ${currentStepNumber} of ${totalSteps} — ${label}`}
    >
      <div className={styles.fill} style={{ width: `${percent}%` }} />
    </div>
  );
}
