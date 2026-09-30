import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSelectAssessmentItems = vi.fn();
vi.mock("./itemSelection", () => ({
  selectAssessmentItems: mockSelectAssessmentItems,
  resolveStartingCefrTarget: (hint: string | null) => hint ?? "A1",
}));

const mockEvaluateWritingResponse = vi.fn();
vi.mock("./writingEvaluation", () => ({
  evaluateWritingResponse: mockEvaluateWritingResponse,
}));

/**
 * A single query chain object per `.from(table)` call, so `.maybeSingle()`
 * can be tracked per-call rather than via a shared mutable flag. Reading
 * normalizes `tableData[table]` (which tests set as either a plain object
 * or an array) to whichever shape the actual call site asks for — a
 * `.maybeSingle()` call takes the first element of an array or the object
 * itself; anything else always sees an array.
 */
function makeTableChain(table: string) {
  let wantsSingle = false;
  const readResult = () => {
    const raw = tableData[table];
    if (wantsSingle) {
      const row = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
      return { data: row, error: null };
    }
    const arr = Array.isArray(raw) ? raw : raw !== undefined ? [raw] : [];
    return { data: arr, error: null };
  };

  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: () => obj,
    in: () => obj,
    order: () => obj,
    limit: () => obj,
    maybeSingle: () => {
      wantsSingle = true;
      return obj;
    },
    insert: (payload: unknown) => {
      recordedInserts.push({ table, payload });
      // Mutate the in-memory fixture so a SUBSEQUENT read within the same
      // test (e.g. finalizeIfAllEvaluated re-checking which writing
      // responses are already evaluated) sees this row — a fake that
      // didn't do this would make every "insert then re-check" code path
      // untestable, or worse, silently pass for the wrong reason.
      if (!insertErrorToReturn) {
        const existing = tableData[table];
        const asArray = Array.isArray(existing) ? existing : existing !== undefined ? [existing] : [];
        tableData[table] = [...asArray, payload];
      }
      return { then: (resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: insertErrorToReturn }).then(resolve) };
    },
    update: (payload: unknown) => {
      recordedUpdates.push({ table, payload });
      return obj;
    },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(readResult()).then(resolve, reject),
  };
  return obj;
}

let recordedInserts: Array<{ table: string; payload: unknown }> = [];
let recordedUpdates: Array<{ table: string; payload: unknown }> = [];
let insertErrorToReturn: unknown = null;
let recordedRpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
let rpcResponses: Record<string, unknown> = {};
let tableData: Record<string, unknown> = {};

function createFakeClient() {
  return {
    from: (table: string) => makeTableChain(table),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      recordedRpcCalls.push({ name, args });
      return rpcResponses[name] ?? { data: null, error: null };
    }),
  };
}

let fakeClient: ReturnType<typeof createFakeClient>;
vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => fakeClient,
}));

const { startAssessment, recordAssessmentResponse, submitAssessment } = await import("./submit");

beforeEach(() => {
  vi.clearAllMocks();
  recordedInserts = [];
  recordedUpdates = [];
  recordedRpcCalls = [];
  rpcResponses = {};
  tableData = {};
  insertErrorToReturn = null;
  fakeClient = createFakeClient();
});

describe("startAssessment — C: honest unavailability, never fabricated content", () => {
  it("returns unavailable when no items exist for this language/level", async () => {
    mockSelectAssessmentItems.mockResolvedValue([]);

    const result = await startAssessment("user-1", "de", "initial_placement", null);

    expect(result).toEqual({ success: false, reason: "unavailable" });
    expect(fakeClient.rpc).not.toHaveBeenCalled();
  });
});

describe("startAssessment — sends only client-safe item content, never the answer key", () => {
  it("returns prompt/options but never answer_key data", async () => {
    mockSelectAssessmentItems.mockResolvedValue([
      {
        itemVersionId: "version-1",
        itemId: "item-1",
        skill: "grammar",
        itemType: "multiple_choice",
        cefrTarget: "A1",
        prompt: { text: "Pick the right word", options: [{ id: "a", label: "Option A" }, { id: "b", label: "Option B" }] },
      },
    ]);
    rpcResponses["cefr_v2_create_assessment"] = { data: "assessment-1", error: null };
    // responseId flows through PublicAssessmentItemSchema, which requires
    // a real UUID (matching production's gen_random_uuid()) — using one
    // here rather than a human-readable id.
    const responseId = "11111111-1111-4111-8111-111111111111";
    tableData["assessment_responses"] = [{ id: responseId, item_version_id: "version-1" }];

    const result = await startAssessment("user-1", "en", "initial_placement", null);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.items).toEqual([
        {
          responseId,
          itemType: "multiple_choice",
          skill: "grammar",
          prompt: { text: "Pick the right word", options: [{ id: "a", label: "Option A" }, { id: "b", label: "Option B" }] },
        },
      ]);
      expect(JSON.stringify(result.items)).not.toContain("correctOptionId");
    }
  });

  it("passes the trusted server-derived user id and language to the RPC, not anything client-controlled", async () => {
    mockSelectAssessmentItems.mockResolvedValue([
      { itemVersionId: "v1", itemId: "i1", skill: "grammar", itemType: "multiple_choice", cefrTarget: "A1", prompt: { text: "Q", options: [] } },
    ]);
    rpcResponses["cefr_v2_create_assessment"] = { data: "assessment-1", error: null };
    tableData["assessment_responses"] = [];

    await startAssessment("user-42", "fr", "initial_placement", "B1");

    expect(recordedRpcCalls[0]).toMatchObject({
      name: "cefr_v2_create_assessment",
      args: { p_user_id: "user-42", p_target_language_code: "fr", p_source_cefr_level: "B1" },
    });
  });
});

describe("recordAssessmentResponse", () => {
  it("returns true when the RPC confirms the write applied", async () => {
    rpcResponses["cefr_v2_record_response"] = { data: true, error: null };

    const applied = await recordAssessmentResponse("user-1", "response-1", { selectedOptionId: "a" });

    expect(applied).toBe(true);
  });

  it("returns false without throwing when the RPC reports it did not apply", async () => {
    rpcResponses["cefr_v2_record_response"] = { data: false, error: null };

    const applied = await recordAssessmentResponse("user-1", "response-1", { selectedOptionId: "a" });

    expect(applied).toBe(false);
  });
});

describe("submitAssessment — M/N: idempotent, retry-safe finalization", () => {
  it("does nothing further when the RPC reports a pure-MCQ assessment already completed", async () => {
    rpcResponses["cefr_v2_submit_assessment"] = { data: { completed: true }, error: null };

    await submitAssessment("user-1", "assessment-1");

    expect(recordedRpcCalls.filter((c) => c.name === "cefr_v2_finalize_writing_skill")).toHaveLength(0);
  });

  it("does nothing further when the RPC reports the assessment was already submitted and terminal (completed)", async () => {
    rpcResponses["cefr_v2_submit_assessment"] = {
      data: { alreadySubmitted: true, status: "completed" },
      error: null,
    };

    await submitAssessment("user-1", "assessment-1");

    expect(mockEvaluateWritingResponse).not.toHaveBeenCalled();
  });

  it("does nothing further when the RPC reports the assessment already failed (terminal, no retry)", async () => {
    rpcResponses["cefr_v2_submit_assessment"] = {
      data: { alreadySubmitted: true, status: "failed" },
      error: null,
    };

    await submitAssessment("user-1", "assessment-1");

    expect(mockEvaluateWritingResponse).not.toHaveBeenCalled();
  });

  it("logs and stops without throwing when the submit RPC itself errors", async () => {
    rpcResponses["cefr_v2_submit_assessment"] = { data: null, error: { message: "boom" } };
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(submitAssessment("user-1", "assessment-1")).resolves.toBeUndefined();

    consoleErrorSpy.mockRestore();
  });
});

describe("submitAssessment — writing evaluation orchestration", () => {
  it("evaluates each pending writing response and finalizes once all succeed", async () => {
    rpcResponses["cefr_v2_submit_assessment"] = {
      data: { pendingWritingResponseIds: ["response-1"] },
      error: null,
    };
    tableData["writing_rubric_versions"] = { id: "rubric-1", criteria: [{ key: "task_achievement", label: "TA", description: "d" }] };
    tableData["language_assessments"] = { target_language_code: "en" };
    tableData["assessment_responses"] = [{ id: "response-1", written_response: "My essay.", item_version_id: "version-1" }];
    tableData["assessment_item_versions"] = [{ id: "version-1", item_type: "writing_prompt", prompt: { text: "Write about your day." } }];

    mockEvaluateWritingResponse.mockResolvedValue({
      success: true,
      data: { criterionResults: [{ criterion: "task_achievement", score: 80, evidence: "Clear." }] },
      aiModel: "gpt-4o-mini",
    });

    await submitAssessment("user-1", "assessment-1");

    const finalizeCalls = recordedRpcCalls.filter((c) => c.name === "cefr_v2_finalize_writing_skill");
    expect(finalizeCalls).toHaveLength(1);
    expect(finalizeCalls[0].args).toMatchObject({ p_assessment_id: "assessment-1", p_user_id: "user-1" });

    const evaluationInserts = recordedInserts.filter((i) => i.table === "writing_evaluations");
    expect(evaluationInserts).toHaveLength(1);
  });

  it("O/P: leaves the assessment retryable (does not finalize) when AI evaluation fails, never fabricating a score", async () => {
    rpcResponses["cefr_v2_submit_assessment"] = {
      data: { pendingWritingResponseIds: ["response-1"] },
      error: null,
    };
    tableData["writing_rubric_versions"] = { id: "rubric-1", criteria: [{ key: "task_achievement", label: "TA", description: "d" }] };
    tableData["language_assessments"] = { target_language_code: "en" };
    tableData["assessment_responses"] = [{ id: "response-1", written_response: "My essay.", item_version_id: "version-1" }];
    tableData["assessment_item_versions"] = [{ id: "version-1", item_type: "writing_prompt", prompt: { text: "Write about your day." } }];

    mockEvaluateWritingResponse.mockResolvedValue({ success: false });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await submitAssessment("user-1", "assessment-1");

    const finalizeCalls = recordedRpcCalls.filter((c) => c.name === "cefr_v2_finalize_writing_skill");
    expect(finalizeCalls).toHaveLength(0);
    const evaluationInserts = recordedInserts.filter((i) => i.table === "writing_evaluations");
    expect(evaluationInserts).toHaveLength(0);
    consoleErrorSpy.mockRestore();
  });

  it("logs rather than silently swallowing it when the DB rejects finalization (e.g. its own evidence-count check fails)", async () => {
    rpcResponses["cefr_v2_submit_assessment"] = {
      data: { pendingWritingResponseIds: ["response-1"] },
      error: null,
    };
    rpcResponses["cefr_v2_finalize_writing_skill"] = {
      data: null,
      error: { message: "still lack an evaluation" },
    };
    tableData["writing_rubric_versions"] = { id: "rubric-1", criteria: [{ key: "task_achievement", label: "TA", description: "d" }] };
    tableData["language_assessments"] = { target_language_code: "en" };
    tableData["assessment_responses"] = [{ id: "response-1", written_response: "My essay.", item_version_id: "version-1" }];
    tableData["assessment_item_versions"] = [{ id: "version-1", item_type: "writing_prompt", prompt: { text: "Write about your day." } }];

    mockEvaluateWritingResponse.mockResolvedValue({
      success: true,
      data: { criterionResults: [{ criterion: "task_achievement", score: 80, evidence: "Clear." }] },
      aiModel: "gpt-4o-mini",
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(submitAssessment("user-1", "assessment-1")).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("cefr_v2_finalize_writing_skill"),
      expect.objectContaining({ assessmentId: "assessment-1" }),
    );
    consoleErrorSpy.mockRestore();
  });

  it("no longer sends items_administered/items_evaluated to the finalize RPC — the DB derives and validates them itself", async () => {
    rpcResponses["cefr_v2_submit_assessment"] = {
      data: { pendingWritingResponseIds: ["response-1"] },
      error: null,
    };
    tableData["writing_rubric_versions"] = { id: "rubric-1", criteria: [{ key: "task_achievement", label: "TA", description: "d" }] };
    tableData["language_assessments"] = { target_language_code: "en" };
    tableData["assessment_responses"] = [{ id: "response-1", written_response: "My essay.", item_version_id: "version-1" }];
    tableData["assessment_item_versions"] = [{ id: "version-1", item_type: "writing_prompt", prompt: { text: "Write about your day." } }];

    mockEvaluateWritingResponse.mockResolvedValue({
      success: true,
      data: { criterionResults: [{ criterion: "task_achievement", score: 80, evidence: "Clear." }] },
      aiModel: "gpt-4o-mini",
    });

    await submitAssessment("user-1", "assessment-1");

    const finalizeCalls = recordedRpcCalls.filter((c) => c.name === "cefr_v2_finalize_writing_skill");
    expect(finalizeCalls[0].args).not.toHaveProperty("p_items_administered");
    expect(finalizeCalls[0].args).not.toHaveProperty("p_items_evaluated");
    expect(finalizeCalls[0].args).toEqual({
      p_assessment_id: "assessment-1",
      p_user_id: "user-1",
      p_raw_score: 80,
    });
  });

  it("fails the assessment outright (not silently stuck forever) when there is no active writing rubric to evaluate against", async () => {
    rpcResponses["cefr_v2_submit_assessment"] = {
      data: { pendingWritingResponseIds: ["response-1"] },
      error: null,
    };
    tableData["writing_rubric_versions"] = null;
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await submitAssessment("user-1", "assessment-1");

    expect(mockEvaluateWritingResponse).not.toHaveBeenCalled();
    const failUpdate = recordedUpdates.find(
      (u) => u.table === "language_assessments" && (u.payload as { status?: string }).status === "failed",
    );
    expect(failUpdate).toBeTruthy();
    consoleErrorSpy.mockRestore();
  });
});
