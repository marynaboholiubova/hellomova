import { describe, expect, it } from "vitest";
import { FUTURE_LEARNING_CAPABILITIES } from "./futureCapabilities";
import { LEARNING_MODES, LearningModeIdSchema } from "./constants";

describe("FUTURE_LEARNING_CAPABILITIES — honest, non-invented preview catalog", () => {
  it("is empty as of Phase 8 — pronunciation graduated into the real engine-backed catalog, and nothing replaced it", () => {
    expect(FUTURE_LEARNING_CAPABILITIES).toEqual([]);
  });

  it("does not contain role_play — never resurrected, never replaced with another invented entry", () => {
    expect(FUTURE_LEARNING_CAPABILITIES.some((capability) => capability.key === "role_play")).toBe(false);
  });

  it("gives every preview (should one be added later) a real reason and a real planned phase — no silent 'someday'", () => {
    for (const capability of FUTURE_LEARNING_CAPABILITIES) {
      expect(capability.comingSoonReason.trim().length).toBeGreaterThan(0);
      expect(capability.plannedPhase.trim().length).toBeGreaterThan(0);
    }
  });

  it("never shares a key with an engine-backed LEARNING_MODES id — the two catalogs model different things and must stay disjoint", () => {
    const engineIds = new Set(LEARNING_MODES.map((mode) => mode.id as string));
    for (const capability of FUTURE_LEARNING_CAPABILITIES) {
      expect(engineIds.has(capability.key)).toBe(false);
    }
  });

  it("no future capability key is ever accepted by LearningModeIdSchema — the structural proof that a preview can never become startable just by rendering it", () => {
    for (const capability of FUTURE_LEARNING_CAPABILITIES) {
      expect(LearningModeIdSchema.safeParse(capability.key).success).toBe(false);
    }
  });
});
