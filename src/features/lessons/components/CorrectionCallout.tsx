import type { LessonCorrection } from "@/features/lessons/types";
import styles from "./CorrectionCallout.module.css";

export function CorrectionCallout({ correction }: { correction: LessonCorrection }) {
  if (!correction.hasCorrection) {
    return null;
  }

  return (
    <div className={styles.callout}>
      {correction.original && (
        <p className={styles.original}>
          <span className={styles.label}>You wrote:</span> {correction.original}
        </p>
      )}
      {correction.corrected && (
        <p className={styles.corrected}>
          <span className={styles.label}>Better:</span> {correction.corrected}
        </p>
      )}
      {correction.explanation && <p className={styles.explanation}>{correction.explanation}</p>}
    </div>
  );
}
