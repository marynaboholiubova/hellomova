import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/constants/routes";
import type { LanguageBrainSummary } from "@/lib/languageBrain/dal";
import styles from "./LanguageBrainView.module.css";

export interface LanguageBrainViewProps {
  targetLanguageName: string;
  summary: LanguageBrainSummary;
}

/** All skills this UI ever shows a row for — see AGENTS.md: only
 * 'grammar' can ever have a real score in Phase 4. Every other skill is
 * shown explicitly as "Not assessed yet," never hidden and never a
 * fabricated number. */
const ALL_SKILLS = [
  { key: "grammar", label: "Grammar" },
  { key: "vocabulary", label: "Vocabulary" },
  { key: "reading", label: "Reading" },
  { key: "writing", label: "Writing" },
  { key: "speaking", label: "Speaking" },
  { key: "listening", label: "Listening" },
  { key: "pronunciation", label: "Pronunciation" },
] as const;

function formatCategory(category: string): string {
  return category.replace(/_/g, " ");
}

function formatPatternKey(patternKey: string): string {
  return patternKey.replace(/-/g, " ");
}

export function LanguageBrainView({ targetLanguageName, summary }: LanguageBrainViewProps) {
  if (!summary.hasAnyEvidence) {
    return (
      <div className={styles.wrapper}>
        <h1 className={styles.heading}>Language Brain — {targetLanguageName}</h1>
        <Card>
          <p className={styles.mutedText}>
            Complete lessons to build your Language Brain. Once you finish a lesson,
            real patterns, vocabulary, and progress will start appearing here.
          </p>
        </Card>
        <Link href={ROUTES.dashboard}>
          <Button fullWidth>Back to dashboard</Button>
        </Link>
      </div>
    );
  }

  const grammarSkill = summary.skills.find((s) => s.skill === "grammar") ?? null;

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.heading}>Language Brain — {targetLanguageName}</h1>
      <p className={styles.mutedText}>
        Based on {summary.profile?.lessonsIngestedCount ?? 0}{" "}
        {summary.profile?.lessonsIngestedCount === 1 ? "completed lesson" : "completed lessons"}.
      </p>

      {summary.strengths.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Your strengths</h2>
          <Card>
            <ul className={styles.list}>
              {summary.strengths.map((s) => (
                <li key={s.skill}>
                  {s.skill}: {s.score}% accuracy over {s.evidenceCount} messages
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Focus areas</h2>
        <Card>
          {summary.weakAreas.length === 0 ? (
            <p className={styles.mutedText}>No recurring weak areas yet — keep practicing.</p>
          ) : (
            <ul className={styles.list}>
              {summary.weakAreas.map((pattern) => (
                <li key={pattern.id}>
                  <strong>{formatCategory(pattern.category)}</strong>: {formatPatternKey(pattern.patternKey)}
                  {" "}
                  <span className={styles.mutedText}>
                    ({pattern.occurrenceCount} {pattern.occurrenceCount === 1 ? "lesson" : "lessons"}
                    {pattern.isRecurring ? ", recurring" : ""})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Review due</h2>
        <Card>
          <p className={styles.dueCount}>{summary.dueReviewCount}</p>
          {summary.dueReviewItems.length === 0 ? (
            <p className={styles.mutedText}>Nothing due for review right now.</p>
          ) : (
            <ul className={styles.list}>
              {summary.dueReviewItems.map((item) => (
                <li key={item.reviewItemId}>
                  {item.term ?? "(item)"}{" "}
                  <span className={styles.mutedText}>
                    — due {new Date(item.dueAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Vocabulary</h2>
        <Card>
          <div className={styles.vocabRow}>
            <div>
              <p className={styles.vocabNumber}>{summary.vocabulary.encountered}</p>
              <p className={styles.mutedText}>Encountered</p>
            </div>
            <div>
              <p className={styles.vocabNumber}>{summary.vocabulary.reviewing}</p>
              <p className={styles.mutedText}>Reviewing</p>
            </div>
            <div>
              <p className={styles.vocabNumber}>{summary.vocabulary.mastered}</p>
              <p className={styles.mutedText}>Mastered</p>
            </div>
          </div>
        </Card>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Skills</h2>
        <Card>
          <ul className={styles.list}>
            {ALL_SKILLS.map(({ key, label }) => {
              const state = key === "grammar" ? grammarSkill : null;
              return (
                <li key={key}>
                  {label}:{" "}
                  {state?.score != null ? (
                    <strong>{state.score}%</strong>
                  ) : (
                    <span className={styles.mutedText}>Not assessed yet</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      {summary.recentPatterns.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Recent patterns</h2>
          <Card>
            <ul className={styles.list}>
              {summary.recentPatterns.map((pattern) => (
                <li key={pattern.id}>
                  <span className={styles.strike}>{pattern.exampleOriginal}</span> →{" "}
                  <strong>{pattern.exampleCorrected}</strong>
                  {pattern.explanation && <div className={styles.mutedText}>{pattern.explanation}</div>}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <Link href={ROUTES.dashboard}>
        <Button fullWidth>Back to dashboard</Button>
      </Link>
    </div>
  );
}
