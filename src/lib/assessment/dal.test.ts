import { describe, expect, it, vi, beforeEach } from "vitest";

const mockVerifySession = vi.fn();
vi.mock("@/lib/auth/dal", () => ({
  verifySession: mockVerifySession,
}));

interface FakeState {
  userLanguages?: Record<string, unknown> | null;
  cefrSkillStates?: Array<Record<string, unknown>>;
  languageAssessments?: Array<Record<string, unknown>>;
  bridgePlans?: Array<Record<string, unknown>>;
  bridgePlanTargets?: Array<Record<string, unknown>>;
}

let state: FakeState = {};
const capturedEqCalls: Array<{ table: string; column: string; value: unknown }> = [];

function chain(table: string, result: unknown, isSingle: boolean) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: (column: string, value: unknown) => {
      capturedEqCalls.push({ table, column, value });
      return obj;
    },
    in: () => obj,
    order: () => obj,
    maybeSingle: () => ({
      then: (resolve: (v: unknown) => void) => Promise.resolve({ data: result, error: null }).then(resolve),
    }),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve({ data: isSingle ? result : (result ?? []), error: null }).then(resolve, reject),
  };
  return obj;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "user_languages") return chain(table, state.userLanguages ?? null, true);
      if (table === "cefr_skill_states") return chain(table, state.cefrSkillStates ?? [], false);
      if (table === "language_assessments") return chain(table, state.languageAssessments ?? [], false);
      if (table === "bridge_plans") return chain(table, state.bridgePlans ?? [], false);
      if (table === "bridge_plan_targets") return chain(table, state.bridgePlanTargets ?? [], false);
      return chain(table, [], false);
    },
  })),
}));

const { getUserLanguageLevels, getCefrSkillProfile, getBridgePlans } = await import("./dal");

beforeEach(() => {
  vi.clearAllMocks();
  capturedEqCalls.length = 0;
  state = {};
  mockVerifySession.mockResolvedValue({ user: { id: "user-1" } });
});

describe("getUserLanguageLevels — O: target-language isolation", () => {
  it("scopes the query by both user_id and the requested target language", async () => {
    state.userLanguages = {
      current_cefr_level: "B1",
      confirmed_cefr_level: null,
      learning_cefr_level: "B1",
      assessment_status: "estimated",
    };

    await getUserLanguageLevels("fr");

    const userIdFilter = capturedEqCalls.find((c) => c.table === "user_languages" && c.column === "user_id");
    const langFilter = capturedEqCalls.find((c) => c.table === "user_languages" && c.column === "target_language_code");
    expect(userIdFilter?.value).toBe("user-1");
    expect(langFilter?.value).toBe("fr");
  });

  it("H: confirmed and learning level are reported independently — they can differ", async () => {
    state.userLanguages = {
      current_cefr_level: "B1",
      confirmed_cefr_level: "A2",
      learning_cefr_level: "B2",
      assessment_status: "confirmed",
    };

    const levels = await getUserLanguageLevels("fr");

    expect(levels?.confirmedCefrLevel).toBe("A2");
    expect(levels?.learningCefrLevel).toBe("B2");
    expect(levels?.confirmedCefrLevel).not.toBe(levels?.learningCefrLevel);
  });

  it("returns null when the user has no row for this language yet (never fabricates one)", async () => {
    state.userLanguages = null;

    const levels = await getUserLanguageLevels("de");

    expect(levels).toBeNull();
  });
});

describe("getCefrSkillProfile — E: unassessed skills are simply absent, never null-filled fake rows", () => {
  it("returns exactly the rows that exist, nothing invented for missing skills", async () => {
    state.cefrSkillStates = [
      { skill: "grammar", status: "estimated", estimated_level: "B1", confirmed_level: null, updated_at: "2026-01-01" },
    ];

    const profile = await getCefrSkillProfile("fr");

    expect(profile).toHaveLength(1);
    expect(profile[0].skill).toBe("grammar");
    // No listening/speaking/pronunciation/reading/vocabulary/writing rows
    // were invented just because they weren't assessed.
    expect(profile.find((s) => s.skill === "listening")).toBeUndefined();
  });

  it("returns an empty array (not null, not fabricated skills) for a brand-new user", async () => {
    state.cefrSkillStates = [];

    const profile = await getCefrSkillProfile("fr");

    expect(profile).toEqual([]);
  });
});

describe("getBridgePlans — U: only links to targets that actually belong to the plan", () => {
  it("attaches each target to its own plan, not any plan", async () => {
    state.bridgePlans = [
      { id: "plan-1", source_level: "A2", target_level: "B1", status: "active" },
      { id: "plan-2", source_level: "B1", target_level: "B2", status: "active" },
    ];
    state.bridgePlanTargets = [
      { bridge_plan_id: "plan-1", skill: "grammar", gap_description: "past tense", status: "pending" },
      { bridge_plan_id: "plan-2", skill: "vocabulary", gap_description: "travel words", status: "pending" },
    ];

    const plans = await getBridgePlans("fr");

    expect(plans.find((p) => p.id === "plan-1")?.targets).toEqual([
      { skill: "grammar", gapDescription: "past tense", status: "pending" },
    ]);
    expect(plans.find((p) => p.id === "plan-2")?.targets).toEqual([
      { skill: "vocabulary", gapDescription: "travel words", status: "pending" },
    ]);
  });

  it("returns an empty array when there are no bridge plans — never a fake 'study more' plan", async () => {
    state.bridgePlans = [];

    const plans = await getBridgePlans("fr");

    expect(plans).toEqual([]);
  });
});
