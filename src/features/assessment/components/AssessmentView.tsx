import { Card } from "@/components/ui/Card";
import { StartAssessmentButton } from "./StartAssessmentButton";
import { ASSESSABLE_SKILLS_TODAY, ASSESSMENT_SKILLS } from "@/lib/assessment/constants";
import type { UserLanguageLevels, CefrSkillStateRecord, LanguageAssessmentSummary, BridgePlanSummary } from "@/lib/assessment/dal";
import styles from "./AssessmentView.module.css";

export interface AssessmentViewProps {
  targetLanguageName: string;
  levels: UserLanguageLevels;
  skillProfile: CefrSkillStateRecord[];
  history: LanguageAssessmentSummary[];
  bridgePlans: BridgePlanSummary[];
}

const SKILL_LABELS: Record<string, string> = {
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  reading: "Reading",
  listening: "Listening",
  writing: "Writing",
  speaking: "Speaking",
  pronunciation: "Pronunciation",
};

function formatStatus(status: string, level: string | null): string {
  if (status === "confirmed" && level) return `Confirmed ${level}`;
  if (status === "estimated" && level) return `Estimated ${level}`;
  return "Not assessed yet";
}

export function AssessmentView({ targetLanguageName, levels, skillProfile, history, bridgePlans }: AssessmentViewProps) {
  const skillByName = new Map(skillProfile.map((s) => [s.skill, s]));

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.heading}>CEFR Assessment — {targetLanguageName}</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Your level</h2>
        <Card>
          <div className={styles.levelRow}>
            <div>
              <p className={styles.levelLabel}>Confirmed level</p>
              <p className={styles.levelValue}>
                {levels.confirmedCefrLevel ?? "Not confirmed yet"}
              </p>
            </div>
            <div>
              <p className={styles.levelLabel}>Learning level</p>
              <p className={styles.levelValue}>{levels.learningCefrLevel ?? "Not set"}</p>
            </div>
          </div>
          {!levels.confirmedCefrLevel && (
            <p className={styles.mutedText}>
              {levels.currentCefrLevel
                ? "Your learning level comes from a CEFR-aligned estimated placement — not yet a full, confirmed HelloMova assessment. Complete a CEFR Assessment to confirm your level."
                : "Complete a CEFR Assessment to get your first estimated level."}
            </p>
          )}
        </Card>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Skill profile</h2>
        <Card>
          <ul className={styles.list}>
            {ASSESSMENT_SKILLS.map((skill) => {
              const state = skillByName.get(skill);
              const isAssessableToday = (ASSESSABLE_SKILLS_TODAY as readonly string[]).includes(skill);
              return (
                <li key={skill}>
                  {SKILL_LABELS[skill] ?? skill}:{" "}
                  {state ? (
                    <strong>{formatStatus(state.status, state.estimatedLevel ?? state.confirmedLevel)}</strong>
                  ) : (
                    <span className={styles.mutedText}>
                      Not assessed yet{!isAssessableToday ? " (not available in this phase)" : ""}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Take a CEFR Assessment</h2>
        <Card>
          <p className={styles.mutedText}>
            A CEFR-aligned assessment covering grammar, vocabulary, reading, and writing — HelloMova&apos;s
            own estimated assessment, not an official certificate.
          </p>
          <StartAssessmentButton />
        </Card>
      </section>

      {history.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Assessment history</h2>
          <Card>
            <ul className={styles.list}>
              {history.map((attempt) => (
                <li key={attempt.id}>
                  {attempt.assessmentType.replace(/_/g, " ")} — {attempt.status}
                  {attempt.startedAt && (
                    <span className={styles.mutedText}> ({new Date(attempt.startedAt).toLocaleDateString()})</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {bridgePlans.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Bridge plan</h2>
          <Card>
            {bridgePlans.map((plan) => (
              <div key={plan.id} className={styles.bridgePlan}>
                <p>
                  <strong>{plan.sourceLevel} → {plan.targetLevel}</strong>{" "}
                  <span className={styles.mutedText}>({plan.status})</span>
                </p>
                <ul className={styles.list}>
                  {plan.targets.map((target, index) => (
                    <li key={index}>
                      {SKILL_LABELS[target.skill] ?? target.skill}: {target.gapDescription}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
