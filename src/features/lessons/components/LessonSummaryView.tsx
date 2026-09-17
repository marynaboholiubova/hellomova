import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/constants/routes";
import type { LessonSummary } from "@/lib/lessons/schemas";
import styles from "./LessonSummaryView.module.css";

export interface LessonSummaryViewProps {
  status: "active" | "completed" | "abandoned";
  summary: LessonSummary | null;
}

export function LessonSummaryView({ status, summary }: LessonSummaryViewProps) {
  return (
    <div className={styles.wrapper}>
      <Card>
        <p className={styles.heading}>
          {status === "abandoned" ? "Lesson ended" : "Lesson complete"}
        </p>
        {summary ? (
          <div className={styles.summary}>
            <p>
              <strong>Objective:</strong> {summary.objective}
            </p>
            <p>
              <strong>What you practiced:</strong> {summary.practiced}
            </p>
            {summary.corrections.length > 0 && (
              <div>
                <strong>Corrections from this lesson:</strong>
                <ul>
                  {summary.corrections.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {summary.vocabulary.length > 0 && (
              <div>
                <strong>Useful vocabulary:</strong>
                <ul>
                  {summary.vocabulary.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <p>
              <strong>Next step:</strong> {summary.nextStep}
            </p>
          </div>
        ) : (
          <p className={styles.muted}>
            {status === "abandoned"
              ? "This lesson was ended before finishing, so there's no summary."
              : "A summary wasn't available for this lesson."}
          </p>
        )}
      </Card>
      <Link href={ROUTES.dashboard}>
        <Button fullWidth>Back to dashboard</Button>
      </Link>
    </div>
  );
}
