import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * These tests exist for one specific reason: 0007_cefr_assessment_v2.sql
 * adds a column-level REVOKE on user_languages.confirmed_cefr_level /
 * learning_cefr_level / assessment_status, justified by the claim that
 * onboarding's own writes never reference those columns. This file proves
 * that claim rather than just asserting it in a migration comment — if a
 * future edit to actions.ts ever starts writing one of those columns, this
 * test suite (not just the live database) should be what catches it.
 */

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

const mockRequireOnboardingStep = vi.fn();
vi.mock("@/lib/onboarding/dal", () => ({
  requireOnboardingStep: mockRequireOnboardingStep,
}));

interface RecordedWrite {
  table: string;
  op: "update" | "upsert" | "insert";
  payload: Record<string, unknown>;
}

let recordedWrites: RecordedWrite[] = [];
let userLanguagesSelectResult: Record<string, unknown> | null = null;

function chain(table: string, op: "update" | "upsert" | "insert", payload: Record<string, unknown>) {
  recordedWrites.push({ table, op, payload });
  const obj: Record<string, unknown> = {
    eq: () => obj,
    neq: () => obj,
    then: (resolve: (v: unknown) => void) => Promise.resolve({ error: null }).then(resolve),
  };
  return obj;
}

const mockCreateClient = vi.fn(async () => ({
  from: (table: string) => ({
    update: (payload: Record<string, unknown>) => chain(table, "update", payload),
    upsert: (payload: Record<string, unknown>) => chain(table, "upsert", payload),
    insert: (payload: Record<string, unknown>) => chain(table, "insert", payload),
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: userLanguagesSelectResult, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

const { saveTargetLanguageAction, submitPlacementTestAction } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  recordedWrites = [];
  userLanguagesSelectResult = null;
  mockRequireOnboardingStep.mockResolvedValue({ id: "user-1" });
});

describe("saveTargetLanguageAction — the only INSERT path into user_languages", () => {
  it("upserts only user_id/target_language_code/is_primary — never a CEFR v2 trusted column", async () => {
    const formData = new FormData();
    formData.set("targetLanguageCode", "fr");

    await saveTargetLanguageAction(undefined, formData);

    const upsert = recordedWrites.find((w) => w.table === "user_languages" && w.op === "upsert");
    expect(upsert?.payload).toEqual({
      user_id: "user-1",
      target_language_code: "fr",
      is_primary: true,
    });
    expect(upsert?.payload).not.toHaveProperty("confirmed_cefr_level");
    expect(upsert?.payload).not.toHaveProperty("learning_cefr_level");
    expect(upsert?.payload).not.toHaveProperty("assessment_status");
  });

  it("the demote-other-languages update only ever touches is_primary", async () => {
    const formData = new FormData();
    formData.set("targetLanguageCode", "fr");

    await saveTargetLanguageAction(undefined, formData);

    const demoteUpdate = recordedWrites.find(
      (w) => w.table === "user_languages" && w.op === "update" && "is_primary" in w.payload,
    );
    expect(demoteUpdate?.payload).toEqual({ is_primary: false });
  });

  it("rejects an invalid language code before touching the database at all", async () => {
    const formData = new FormData();
    formData.set("targetLanguageCode", "not-a-real-language");

    const result = await saveTargetLanguageAction(undefined, formData);

    expect(result).toEqual({ error: "Please choose a language." });
    expect(recordedWrites).toHaveLength(0);
  });
});

describe("submitPlacementTestAction — the only UPDATE path that sets current_cefr_level", () => {
  it("writes only current_cefr_level to user_languages — never confirmed_cefr_level or assessment_status", async () => {
    userLanguagesSelectResult = { target_language_code: "en" };

    const { EN_PLACEMENT_BANK } = await import("@/lib/placement/banks/en");
    const formData = new FormData();
    for (const question of EN_PLACEMENT_BANK) {
      formData.set(`answer-${question.id}`, question.correctOptionId);
    }

    await submitPlacementTestAction(undefined, formData);

    const levelUpdate = recordedWrites.find(
      (w) => w.table === "user_languages" && w.op === "update" && "current_cefr_level" in w.payload,
    );
    expect(levelUpdate).toBeTruthy();
    expect(levelUpdate?.payload).toEqual({ current_cefr_level: expect.any(String) });
    expect(levelUpdate?.payload).not.toHaveProperty("confirmed_cefr_level");
    expect(levelUpdate?.payload).not.toHaveProperty("assessment_status");
    expect(levelUpdate?.payload).not.toHaveProperty("learning_cefr_level");
  });
});
