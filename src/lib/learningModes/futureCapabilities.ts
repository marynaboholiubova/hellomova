/**
 * Phase 7 — honest "coming soon" previews for the dashboard.
 *
 * STRUCTURALLY SEPARATE from src/lib/learningModes/constants.ts on
 * purpose: these are NOT learning modes. `key` is a plain string used
 * only as a React list key — it is never validated against
 * LearningModeIdSchema, LessonEngineModeIdSchema, or LessonModeSchema,
 * never read by any server action, and never reaches any trusted table.
 * Nothing in this file can cause any real engine to behave as though one
 * of these capabilities already existed. That separation is what makes it
 * safe to preview an honestly-future capability on the dashboard without
 * any risk of it ever being accidentally startable.
 *
 * EMPTY as of Phase 8: `pronunciation` was this catalog's only entry
 * (Phase 7) and has now been promoted into
 * src/lib/learningModes/constants.ts's real, engine-backed
 * `LEARNING_MODES` — see 0009_pronunciation.sql and
 * src/features/pronunciation/ for the now-real implementation this phase
 * built. This file is kept (not deleted) as the structurally-separate
 * home for the NEXT genuinely-grounded future capability, whenever one
 * exists — do not add a placeholder entry just to keep this file
 * non-empty. "Role Play" remains deliberately absent: it has no defined
 * product scope anywhere in this repo, so it is not resurrected here
 * either (see AGENTS.md's "Learning Modes" section).
 */

export interface FutureLearningCapability {
  /** React list key only — deliberately NOT an engine mode id. */
  key: string;
  label: string;
  description: string;
  comingSoonReason: string;
  plannedPhase: string;
}

export const FUTURE_LEARNING_CAPABILITIES: readonly FutureLearningCapability[] = [] as const;
