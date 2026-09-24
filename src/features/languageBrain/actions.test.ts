import { describe, expect, it, vi, beforeEach } from "vitest";

const mockVerifySession = vi.fn();
vi.mock("@/lib/auth/dal", () => ({
  verifySession: mockVerifySession,
}));

const mockMaybeSingle = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: mockMaybeSingle,
          }),
        }),
      }),
    }),
  })),
}));

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: vi.fn(() => ({ rpc: mockRpc })),
}));

const { recordReviewResultAction } = await import("./actions");

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("reviewItemId", "123e4567-e89b-12d3-a456-426614174000");
  formData.set("result", "good");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifySession.mockResolvedValue({ user: { id: "user-1" } });
  mockRpc.mockResolvedValue({ data: true, error: null });
});

describe("recordReviewResultAction — input validation", () => {
  it("rejects an invalid review item id", async () => {
    const result = await recordReviewResultAction(undefined, buildFormData({ reviewItemId: "not-a-uuid" }));
    expect(result).toEqual({ error: "Invalid review item." });
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("rejects an invalid result value", async () => {
    const result = await recordReviewResultAction(undefined, buildFormData({ result: "excellent" }));
    expect(result).toEqual({ error: "Invalid review result." });
  });
});

describe("recordReviewResultAction — M: cannot act on another user's review item", () => {
  it("treats a not-found-or-not-owned item as not found", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await recordReviewResultAction(undefined, buildFormData());

    expect(result).toEqual({ error: "That review item couldn't be found." });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("recordReviewResultAction — K/L: schedule/mastery are computed server-side, never trusted from the client", () => {
  it("computes the new stage/due date/mastery from the DB-read current stage using the real spaced-repetition rule, and passes those (not client input) to the RPC", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "review-1", review_stage: 3, source_type: "vocabulary" }, error: null });

    await recordReviewResultAction(undefined, buildFormData({ result: "good" }));

    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [fnName, args] = mockRpc.mock.calls[0];
    expect(fnName).toBe("language_brain_record_review_result");
    expect(args).toMatchObject({
      p_review_item_id: "123e4567-e89b-12d3-a456-426614174000",
      p_user_id: "user-1",
      p_expected_current_stage: 3,
      p_result: "good",
      p_new_stage: 4, // 3 -> 4 per the fixed schedule
      p_new_mastery_score: 100, // reaching the final stage marks mastery
    });
  });

  it("a failed review resets to stage 1 and clears mastery, regardless of the client's submitted result wording", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "review-1", review_stage: 4, source_type: "vocabulary" }, error: null });

    await recordReviewResultAction(undefined, buildFormData({ result: "again" }));

    const [, args] = mockRpc.mock.calls[0];
    expect(args).toMatchObject({ p_new_stage: 1, p_new_mastery_score: null });
  });
});

describe("recordReviewResultAction — optimistic concurrency", () => {
  it("surfaces a retry message when the RPC reports the item changed underneath it", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "review-1", review_stage: 1, source_type: "vocabulary" }, error: null });
    mockRpc.mockResolvedValue({ data: false, error: null });

    const result = await recordReviewResultAction(undefined, buildFormData());

    expect(result).toEqual({
      error: "This review item was already updated elsewhere. Please refresh and try again.",
    });
  });

  it("returns a generic error, never a raw DB error, when the RPC call itself fails", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "review-1", review_stage: 1, source_type: "vocabulary" }, error: null });
    mockRpc.mockResolvedValue({ data: null, error: { message: "constraint violation on internal_table_xyz" } });

    const result = await recordReviewResultAction(undefined, buildFormData());

    expect(result).toEqual({ error: "Couldn't record your review. Please try again." });
  });
});

describe("recordReviewResultAction — success", () => {
  it("returns success once the RPC confirms the update applied", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "review-1", review_stage: 1, source_type: "vocabulary" }, error: null });

    const result = await recordReviewResultAction(undefined, buildFormData());

    expect(result).toEqual({ success: true });
  });
});
