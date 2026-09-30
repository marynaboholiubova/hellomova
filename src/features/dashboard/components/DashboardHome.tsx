import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StartLessonButton } from "@/features/lessons/components/StartLessonButton";
import { ROUTES } from "@/constants/routes";
import styles from "./DashboardHome.module.css";

export interface DashboardBrainSnapshot {
  hasAnyEvidence: boolean;
  dueReviewCount: number;
  /** e.g. "grammar: past tense irregular verbs" — the single top weak area, if any. */
  topFocusAreaLabel: string | null;
}

export interface DashboardLevelSummary {
  /** Only ever non-null once a real, policy-gated level_confirmation
   * assessment has passed — see AGENTS.md's CEFR v2 section. Never
   * copied from a legacy v1 estimate. */
  confirmedCefrLevel: string | null;
  /** The learner's current estimated/study-reference level — backfilled
   * from legacy placement v1's result, or set by a later CEFR v2
   * initial_placement. Explicitly labeled "Estimated," never "Confirmed." */
  learningCefrLevel: string | null;
}

export interface DashboardHomeProps {
  displayName: string | null;
  email: string | null;
  targetLanguageName: string | null;
  levels: DashboardLevelSummary | null;
  goalLabel: string | null;
  teacherName: string | null;
  canStartLesson: boolean;
  activeLessonSessionId: string | null;
  /** null when there's no target language selected yet — the Language
   * Brain section then just shows the same empty state as no evidence. */
  languageBrain: DashboardBrainSnapshot | null;
}

function formatLevelTag(levels: DashboardLevelSummary | null): string {
  if (levels?.confirmedCefrLevel) {
    return `Confirmed ${levels.confirmedCefrLevel}`;
  }
  if (levels?.learningCefrLevel) {
    return `Estimated ${levels.learningCefrLevel}`;
  }
  return "Not yet assessed";
}

const QUICK_PRACTICE_TILES = ["Talk with AI", "Pronunciation", "Role Play"];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getFriendlyName(displayName: string | null, email: string | null): string | null {
  if (displayName) return displayName;
  if (email) return email.split("@")[0];
  return null;
}

export function DashboardHome({
  displayName,
  email,
  targetLanguageName,
  levels,
  goalLabel,
  teacherName,
  canStartLesson,
  activeLessonSessionId,
  languageBrain,
}: DashboardHomeProps) {
  const friendlyName = getFriendlyName(displayName, email);
  const greeting = friendlyName ? `${getGreeting()}, ${friendlyName}` : `${getGreeting()}!`;

  return (
    <div className={styles.wrapper}>
      <div>
        <h1 className={styles.heading}>{greeting}</h1>
        {targetLanguageName && (
          <>
            <p className={styles.tag}>
              {targetLanguageName} • {formatLevelTag(levels)}
            </p>
            <Link href={ROUTES.assessment} className={styles.sectionLink}>
              View level details
            </Link>
          </>
        )}
      </div>

      <Card className={styles.lessonCard}>
        <p className={styles.lessonLabel}>Today&apos;s lesson</p>
        <h2 className={styles.lessonHeading}>
          {activeLessonSessionId
            ? "You have a lesson in progress"
            : canStartLesson
              ? "Ready for a lesson?"
              : "Choose a target language to start"}
        </h2>
        {(teacherName || goalLabel) && (
          <p className={styles.lessonMeta}>
            {teacherName && `Your teacher: ${teacherName}`}
            {teacherName && goalLabel && " • "}
            {goalLabel && `Goal: ${goalLabel}`}
          </p>
        )}
        {activeLessonSessionId ? (
          <Link href={`/dashboard/lessons/${activeLessonSessionId}`}>
            <Button fullWidth>Continue lesson</Button>
          </Link>
        ) : canStartLesson ? (
          <StartLessonButton />
        ) : (
          <Button disabled fullWidth>
            No target language yet
          </Button>
        )}
      </Card>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Quick practice</h2>
        <div className={styles.tileRow}>
          {QUICK_PRACTICE_TILES.map((tile) => (
            <div key={tile} className={styles.tile}>
              <span>{tile}</span>
              <span className={styles.soonTag}>Soon</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <h2 className={styles.sectionHeading}>Language Brain</h2>
          {languageBrain?.hasAnyEvidence && (
            <Link href={ROUTES.languageBrain} className={styles.sectionLink}>
              View all
            </Link>
          )}
        </div>
        <Card>
          {!languageBrain || !languageBrain.hasAnyEvidence ? (
            <p className={styles.mutedText}>Complete lessons to build your Language Brain.</p>
          ) : (
            <div className={styles.brainSummaryRow}>
              <div>
                <p className={styles.brainStatNumber}>{languageBrain.dueReviewCount}</p>
                <p className={styles.brainStatLabel}>
                  {languageBrain.dueReviewCount === 1 ? "item due for review" : "items due for review"}
                </p>
              </div>
              {languageBrain.topFocusAreaLabel && (
                <div>
                  <p className={styles.brainStatLabel}>Top focus area</p>
                  <p className={styles.brainFocusText}>{languageBrain.topFocusAreaLabel}</p>
                </div>
              )}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
