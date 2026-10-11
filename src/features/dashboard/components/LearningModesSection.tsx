import Link from "next/link";
import { LEARNING_MODES } from "@/lib/learningModes/constants";
import { FUTURE_LEARNING_CAPABILITIES } from "@/lib/learningModes/futureCapabilities";
import { StartLessonButton } from "@/features/lessons/components/StartLessonButton";
import styles from "./LearningModesSection.module.css";

export interface LearningModesSectionProps {
  /** Same value already computed for the dashboard's lesson card — no extra fetch here (see AGENTS.md Phase 7 performance notes). */
  canStartLesson: boolean;
  /**
   * The caller's one most-recent active lesson_sessions row, if any, with
   * its own `mode` — Phase 9 needs this (not just the bare id) because
   * more than one `kind: "lesson"` mode now exists (general, business):
   * "Continue lesson" must only ever appear on the tile whose mode
   * actually matches the active session, never on every lesson tile.
   */
  activeLessonSession: { id: string; mode: string } | null;
}

/**
 * Renders two deliberately separate, honest catalogs:
 * LEARNING_MODES (src/lib/learningModes/constants.ts), every entry of
 * which is a real, engine-backed, startable mode — each with its own
 * `kind` (lesson vs pronunciation, as of Phase 8) determining how it's
 * launched — and FUTURE_LEARNING_CAPABILITIES
 * (src/lib/learningModes/futureCapabilities.ts), non-interactive previews
 * of real future product capabilities (currently empty). Replaces the old
 * static "Quick practice" tile row, which statically labeled every tile
 * "Soon" — including "Talk with AI," even though that mode (general)
 * already worked via the lesson card above, and which also carried an
 * undefined "Role Play" label with no product backing. That label was
 * removed rather than kept or replaced with another invented entry.
 */
export function LearningModesSection({ canStartLesson, activeLessonSession }: LearningModesSectionProps) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionHeading}>Learning modes</h2>
      <div className={styles.grid}>
        {LEARNING_MODES.map((mode) => {
          const isActiveForThisMode = mode.kind === "lesson" && activeLessonSession?.mode === mode.id;

          return (
            <div key={mode.id} className={styles.activeTile}>
              <div className={styles.tileHeaderRow}>
                <span className={styles.tileLabel}>{mode.label}</span>
                <span className={styles.availableBadge}>Available</span>
              </div>
              <p className={styles.tileDescription}>{mode.description}</p>
              {mode.kind === "pronunciation" ? (
                canStartLesson ? (
                  <Link href={mode.route} className={styles.tileLink}>
                    Practice pronunciation
                  </Link>
                ) : (
                  <p className={styles.tileMutedText}>Choose a target language first</p>
                )
              ) : isActiveForThisMode && activeLessonSession ? (
                <Link href={`/dashboard/lessons/${activeLessonSession.id}`} className={styles.tileLink}>
                  Continue lesson
                </Link>
              ) : canStartLesson ? (
                <StartLessonButton modeId={mode.id} label="Start" />
              ) : (
                <p className={styles.tileMutedText}>Choose a target language first</p>
              )}
            </div>
          );
        })}

        {FUTURE_LEARNING_CAPABILITIES.map((capability) => (
          <div
            key={capability.key}
            className={styles.lockedTile}
            aria-label={`${capability.label} — coming soon in ${capability.plannedPhase}. ${capability.comingSoonReason}`}
          >
            <div className={styles.tileHeaderRow}>
              <span className={styles.tileLabel}>{capability.label}</span>
              <span className={styles.soonBadge}>Coming soon</span>
            </div>
            <p className={styles.tileDescription}>{capability.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
