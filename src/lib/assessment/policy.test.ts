import { describe, expect, it, vi, beforeEach } from "vitest";

let policyRow: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: policyRow, error: policyRow ? null : null }),
          }),
        }),
      }),
    }),
  })),
}));

const { getActivePolicy, hasActiveLevelConfirmationPolicy } = await import("./policy");

beforeEach(() => {
  vi.clearAllMocks();
  policyRow = null;
});

describe("getActivePolicy — S/T: fail-closed when no policy is active", () => {
  it("returns null when there is no active row for the area (the real, current state of every policy area today)", async () => {
    const policy = await getActivePolicy("level_confirmation");
    expect(policy).toBeNull();
  });

  it("hasActiveLevelConfirmationPolicy is false absent an active policy — this is what prevents auto-promotion", async () => {
    const result = await hasActiveLevelConfirmationPolicy();
    expect(result).toBe(false);
  });

  it("returns a real policy when one genuinely exists and is active (proves the read path itself works, not just the empty case)", async () => {
    policyRow = {
      id: "policy-1",
      policy_area: "level_confirmation",
      version_label: "v1",
      rules: { minimumItemsPerSkill: 5 },
      activated_at: "2026-01-01T00:00:00.000Z",
    };

    const policy = await getActivePolicy("level_confirmation");

    expect(policy).toEqual({
      id: "policy-1",
      policyArea: "level_confirmation",
      versionLabel: "v1",
      rules: { minimumItemsPerSkill: 5 },
      activatedAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
