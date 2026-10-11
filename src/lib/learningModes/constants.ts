import * as z from "zod";
import { LessonModeSchema, type LessonMode } from "@/lib/lessons/schemas";

/**
 * Phase 7 — Learning Modes: the canonical catalog of ENGINE-BACKED,
 * actually startable learning modes. Phase 8 broadens this catalog to
 * cover more than one backing engine — see `kind` below — without
 * weakening the lesson engine's own trust boundary.
 *
 * GROUNDING, not invention: "general" was the only mode here through
 * Phase 7. Phase 8 makes `pronunciation` real (see
 * src/features/pronunciation/) and promotes it here from
 * futureCapabilities.ts, per this phase's explicit instruction to only
 * flip that switch once the underlying functionality is genuinely
 * complete (real audio capture, real transcription, real structured
 * evaluation, real persistence — see 0009_pronunciation.sql and
 * AGENTS.md's "Pronunciation / Mary" section).
 *
 * Phase 9 adds `business`, a second `kind: "lesson"` entry — a distinct
 * learning INTENT, not a teacher reskin: James (Business English) and the
 * "business" learning goal remain fully independent choices (see
 * src/constants/teachers.ts, goals.ts) and are completely unaffected by
 * this mode existing. See AGENTS.md's "Business (Phase 9)" section for
 * the full grounding and the product decisions this phase deliberately
 * left open (teacher auto-binding, curriculum taxonomy). Career remains
 * out of scope entirely (Phase 10) — do not add it here.
 */

export type LearningModeKind = "lesson" | "pronunciation";

interface LearningModeBase {
  id: string;
  kind: LearningModeKind;
  label: string;
  description: string;
}

export interface LessonEngineMode extends LearningModeBase {
  kind: "lesson";
  /**
   * Must be a value LessonModeSchema actually accepts — this is what lets
   * this id be sent straight through to the existing lesson engine's
   * `lesson_sessions.mode` column. Enforced by constants.test.ts.
   */
  id: LessonMode;
}

export interface PronunciationEngineMode extends LearningModeBase {
  kind: "pronunciation";
  id: "pronunciation";
  /** Dedicated route — pronunciation practice is its own page, not an inline dashboard control (see startLessonAction vs startPronunciationAttemptAction: two different backing engines). */
  route: string;
}

export type LearningModeDefinition = LessonEngineMode | PronunciationEngineMode;

export const LEARNING_MODES: readonly LearningModeDefinition[] = [
  {
    id: "general",
    kind: "lesson",
    label: "Talk with AI",
    description: "An open, adaptive text lesson with your teacher — practice at your own pace.",
  },
  {
    id: "pronunciation",
    kind: "pronunciation",
    label: "Pronunciation",
    description: "Record yourself saying a phrase and get honest, transcript-based feedback from Mary.",
    route: "/dashboard/pronunciation",
  },
  {
    id: "business",
    kind: "lesson",
    label: "Business",
    description: "A lesson focused on professional communication — meetings, email, and workplace vocabulary.",
  },
] as const satisfies readonly LearningModeDefinition[];

export function getLearningModeById(id: string): LearningModeDefinition | undefined {
  return LEARNING_MODES.find((mode) => mode.id === id);
}

const LESSON_ENGINE_MODE_IDS = LEARNING_MODES.filter(
  (mode): mode is LessonEngineMode => mode.kind === "lesson",
).map((mode) => mode.id);

/**
 * The server-side acceptance gate for startLessonAction specifically —
 * ONLY the lesson-engine-backed subset of the catalog, never the full
 * catalog. `pronunciation` is a real startable mode (see LEARNING_MODES
 * above) but it is NOT a lesson_sessions.mode value and must never reach
 * startLessonAction — this schema is what makes that structural, not
 * just conventional. Tested (constants.test.ts) to stay in lockstep with
 * LessonModeSchema, the lesson engine's own DB-write gate.
 */
export const LessonEngineModeIdSchema = z.enum(
  LESSON_ENGINE_MODE_IDS as [LessonMode, ...LessonMode[]],
) satisfies z.ZodType<LessonMode>;

/**
 * The catalog-wide schema: any id that is a real, currently-startable
 * Learning Mode, regardless of which engine backs it. Used for
 * general "is this a legitimate mode at all" checks (e.g. routing) —
 * NEVER as the write-gate for a specific engine's own trusted table.
 * Each engine (lesson vs pronunciation) enforces its OWN narrower
 * boundary independently: see LessonEngineModeIdSchema above and
 * src/features/pronunciation/actions.ts, which doesn't need a "mode"
 * field at all since pronunciation has exactly one startable shape.
 */
export const LearningModeIdSchema = z.enum(
  LEARNING_MODES.map((mode) => mode.id) as [string, ...string[]],
);

export type LearningModeId = z.infer<typeof LearningModeIdSchema>;

/** Re-exported for tests/call sites that want to assert catalog/engine agreement without importing both modules. */
export { LessonModeSchema };
