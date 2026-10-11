import { describe, expect, it } from "vitest";
import {
  LEARNING_MODES,
  LearningModeIdSchema,
  LessonEngineModeIdSchema,
  getLearningModeById,
  LessonModeSchema,
} from "./constants";
import { FUTURE_LEARNING_CAPABILITIES } from "./futureCapabilities";

describe("LEARNING_MODES — canonical catalog integrity", () => {
  it("has no duplicate ids", () => {
    const ids = LEARNING_MODES.map((mode) => mode.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every mode a non-empty label and description", () => {
    for (const mode of LEARNING_MODES) {
      expect(mode.label.trim().length).toBeGreaterThan(0);
      expect(mode.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("contains exactly the three modes real as of Phase 9: general (lesson), pronunciation, business (lesson)", () => {
    expect(LEARNING_MODES.map((mode) => ({ id: mode.id, kind: mode.kind }))).toEqual([
      { id: "general", kind: "lesson" },
      { id: "pronunciation", kind: "pronunciation" },
      { id: "business", kind: "lesson" },
    ]);
  });

  it("does not contain role_play — an old inert UI label is not a defined product mode", () => {
    const ids: readonly string[] = LEARNING_MODES.map((mode) => mode.id);
    expect(ids.includes("role_play")).toBe(false);
  });

  it("does not contain career — Phase 10 is out of scope and must never be accidentally implemented here", () => {
    const ids: readonly string[] = LEARNING_MODES.map((mode) => mode.id);
    expect(ids.includes("career")).toBe(false);
  });

  it("gives the pronunciation mode a dedicated route, since it is not an inline lesson-engine control", () => {
    const pronunciation = LEARNING_MODES.find((mode) => mode.id === "pronunciation");
    expect(pronunciation?.kind).toBe("pronunciation");
    if (pronunciation?.kind === "pronunciation") {
      expect(pronunciation.route).toBe("/dashboard/pronunciation");
    }
  });
});

describe("getLearningModeById — deterministic lookup", () => {
  it("finds the general mode by id", () => {
    expect(getLearningModeById("general")?.label).toBe("Talk with AI");
  });

  it("finds the pronunciation mode by id", () => {
    expect(getLearningModeById("pronunciation")?.kind).toBe("pronunciation");
  });

  it("finds the business mode by id", () => {
    expect(getLearningModeById("business")?.kind).toBe("lesson");
  });

  it("returns undefined for an unknown id, never a fabricated default", () => {
    expect(getLearningModeById("does-not-exist")).toBeUndefined();
  });

  it("returns undefined for role_play and career — neither is a defined product mode", () => {
    expect(getLearningModeById("role_play")).toBeUndefined();
    expect(getLearningModeById("career")).toBeUndefined();
  });
});

describe("LessonEngineModeIdSchema — startLessonAction's acceptance gate accepts ONLY lesson-engine-backed modes", () => {
  it("accepts general and business", () => {
    expect(LessonEngineModeIdSchema.safeParse("general").success).toBe(true);
    expect(LessonEngineModeIdSchema.safeParse("business").success).toBe(true);
  });

  it("rejects pronunciation — a real startable mode, but backed by a different engine entirely, so it must never reach lesson_sessions", () => {
    expect(LessonEngineModeIdSchema.safeParse("pronunciation").success).toBe(false);
  });

  it("rejects role_play, career, and arbitrary strings", () => {
    expect(LessonEngineModeIdSchema.safeParse("role_play").success).toBe(false);
    expect(LessonEngineModeIdSchema.safeParse("career").success).toBe(false);
    expect(LessonEngineModeIdSchema.safeParse("<script>").success).toBe(false);
  });

  it("stays in lockstep with LessonModeSchema — the lesson engine's own DB-write gate — so the catalog can never silently drift from what lesson_sessions.mode actually accepts", () => {
    expect(LessonEngineModeIdSchema.options.slice().sort()).toEqual(LessonModeSchema.options.slice().sort());
  });
});

describe("LearningModeIdSchema — the catalog-wide 'is this any real startable mode' check", () => {
  it("accepts every mode currently in LEARNING_MODES, regardless of which engine backs it", () => {
    for (const mode of LEARNING_MODES) {
      expect(LearningModeIdSchema.safeParse(mode.id).success).toBe(true);
    }
  });

  it("rejects role_play, career, and arbitrary strings", () => {
    expect(LearningModeIdSchema.safeParse("role_play").success).toBe(false);
    expect(LearningModeIdSchema.safeParse("career").success).toBe(false);
  });

  it("rejects every future-capability preview key — a preview can never double as a real startable mode just by existing in the broader catalog schema", () => {
    for (const capability of FUTURE_LEARNING_CAPABILITIES) {
      expect(LearningModeIdSchema.safeParse(capability.key).success).toBe(false);
    }
  });

  it("is a strictly broader schema than LessonEngineModeIdSchema — pronunciation is in one but not the other, by design", () => {
    expect(LearningModeIdSchema.safeParse("pronunciation").success).toBe(true);
    expect(LessonEngineModeIdSchema.safeParse("pronunciation").success).toBe(false);
  });
});
