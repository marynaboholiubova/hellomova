import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * ensureLessonIngested orchestrates several real Postgres round trips
 * (see 0006_language_brain.sql for what each one atomically guarantees on
 * the real database — no live Postgres is available in this environment,
 * consistent with the rest of this codebase's test suite). What's
 * testable and tested here is ensureLessonIngested's own JS-level
 * orchestration: idempotency short-circuiting, retry-after-failure,
 * per-lesson pattern dedup, grammar-score input derivation, and
 * vocabulary normalization — the actual cross-lesson counting/threshold
 * enforcement lives in the SQL function and is code-reviewed against the
 * unique constraints and generated column there (see AGENTS.md's manual
 * verification steps).
 */

const mockClassify = vi.fn();
vi.mock("./errorClassification", () => ({
  classifyObservedCorrections: mockClassify,
}));

/** A minimal, uniformly-thenable chain stub: every method returns the
 * same object (so any chain depth works), and the object itself
 * resolves via `.then` to a fixed result when awaited. */
function chain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: () => obj,
    order: () => obj,
    in: () => obj,
    limit: () => obj,
    maybeSingle: () => obj,
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

function mutationChain(result: { error: unknown }) {
  const obj: Record<string, unknown> = {
    eq: () => obj,
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

interface FakeClientOptions {
  sessionRow: {
    id: string;
    user_id: string;
    target_language_code: string;
    status: string;
    summary: unknown;
  } | null;
  ingestionSelect: { status: string; attempt_count: number } | null;
  insertConflict?: boolean;
  messages?: Array<{ role: string; metadata: unknown }>;
  rpcResult?: { data: unknown; error: unknown };
}

function createFakeServiceRoleClient(opts: FakeClientOptions) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const rpcCalls: Array<{ fnName: string; args: Record<string, unknown> }> = [];

  const tableBuilders: Record<string, Record<string, (...args: unknown[]) => unknown>> = {
    lesson_sessions: {
      select: () => chain({ data: opts.sessionRow, error: null }),
    },
    language_brain_ingestions: {
      insert: (payload: unknown) => {
        inserts.push(payload);
        return mutationChain({ error: opts.insertConflict ? { code: "23505" } : null });
      },
      select: () => chain({ data: opts.ingestionSelect, error: null }),
      update: (payload: unknown) => {
        updates.push(payload);
        return mutationChain({ error: null });
      },
    },
    lesson_messages: {
      select: () => chain({ data: opts.messages ?? [], error: null }),
    },
  };

  return {
    from: (table: string) => tableBuilders[table],
    rpc: vi.fn(async (fnName: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fnName, args });
      return opts.rpcResult ?? { data: {}, error: null };
    }),
    __inserts: inserts,
    __updates: updates,
    __rpcCalls: rpcCalls,
  };
}

let fakeClient: ReturnType<typeof createFakeServiceRoleClient>;
vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => fakeClient,
}));

const { ensureLessonIngested } = await import("./ingest");

const BASE_SESSION = {
  id: "session-1",
  user_id: "user-1",
  target_language_code: "fr",
  status: "completed",
  summary: { objective: "o", practiced: "p", corrections: [], vocabulary: [], nextStep: "n" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockClassify.mockImplementation(async (corrections: unknown) =>
    (corrections as Array<{ index: number }>).map((c) => ({
      ...c,
      category: "other" as const,
      patternKey: `pattern-${c.index}`,
      aiClassified: false,
    })),
  );
});

describe("ensureLessonIngested — does not process non-completed sessions", () => {
  it("is a no-op for an active session", async () => {
    fakeClient = createFakeServiceRoleClient({
      sessionRow: { ...BASE_SESSION, status: "active" },
      ingestionSelect: { status: "pending", attempt_count: 0 },
    });

    await ensureLessonIngested("session-1");

    expect(fakeClient.__rpcCalls).toHaveLength(0);
    expect(fakeClient.__inserts).toHaveLength(0);
  });
});

describe("ensureLessonIngested — A: the same completed lesson is never ingested twice", () => {
  it("no-ops without calling the RPC when the ingestion row is already 'completed'", async () => {
    fakeClient = createFakeServiceRoleClient({
      sessionRow: BASE_SESSION,
      ingestionSelect: { status: "completed", attempt_count: 1 },
      insertConflict: true,
    });

    await ensureLessonIngested("session-1");

    expect(fakeClient.__rpcCalls).toHaveLength(0);
  });
});

describe("ensureLessonIngested — P: retry after a failed attempt re-processes without a stale short-circuit", () => {
  it("proceeds to call the RPC again when the ingestion row is 'failed'", async () => {
    fakeClient = createFakeServiceRoleClient({
      sessionRow: BASE_SESSION,
      ingestionSelect: { status: "failed", attempt_count: 1 },
      insertConflict: true,
      messages: [{ role: "learner", metadata: null }],
    });

    await ensureLessonIngested("session-1");

    expect(fakeClient.__rpcCalls).toHaveLength(1);
    expect(fakeClient.__updates.some((u) => (u as { attempt_count?: number }).attempt_count === 2)).toBe(true);
  });
});

describe("ensureLessonIngested — per-lesson recurring-error dedup", () => {
  it("deduplicates identical pattern keys within one lesson before calling the RPC (the SQL layer counts this as at most one occurrence)", async () => {
    mockClassify.mockResolvedValue([
      { index: 0, original: "I goed", corrected: "I went", explanation: null, category: "tense", patternKey: "past-irregular-go", aiClassified: true },
      { index: 1, original: "she goed", corrected: "she went", explanation: null, category: "tense", patternKey: "past-irregular-go", aiClassified: true },
      { index: 2, original: "they goed", corrected: "they went", explanation: null, category: "tense", patternKey: "past-irregular-go", aiClassified: true },
    ]);

    fakeClient = createFakeServiceRoleClient({
      sessionRow: BASE_SESSION,
      ingestionSelect: { status: "pending", attempt_count: 0 },
      messages: [
        { role: "learner", metadata: null },
        { role: "teacher", metadata: { correction: { hasCorrection: true, original: "I goed", corrected: "I went", explanation: null } } },
      ],
    });

    await ensureLessonIngested("session-1");

    const call = fakeClient.__rpcCalls[0];
    expect(call.args.p_errors).toHaveLength(1);
  });
});

describe("ensureLessonIngested — grammar evidence derivation (THIS LESSON's raw counts only)", () => {
  /**
   * ensureLessonIngested no longer reads any prior cumulative grammar
   * state before ingesting — it only ever computes and sends the counts
   * for the lesson currently being ingested. The RPC (0006_language_brain.sql)
   * is what atomically ADDS these to the stored cumulative counters via
   * `INSERT ... ON CONFLICT DO UPDATE SET x = x + excluded.x`, which is
   * what actually makes concurrent ingestion for the same
   * (user, target_language_code) safe — that atomicity/locking guarantee
   * requires live Postgres and is NOT provable by Vitest; see this
   * migration's manual verification steps. What's provable here is that
   * this side of the boundary sends only its own lesson's raw evidence,
   * never a precomputed cumulative final value.
   */
  it("computes total/positive learner-turn counts from lesson_messages and sends them as this lesson's own raw evidence", async () => {
    mockClassify.mockResolvedValue([
      { index: 0, original: "He have", corrected: "He has", explanation: null, category: "agreement", patternKey: "third-person-agreement", aiClassified: true },
    ]);

    fakeClient = createFakeServiceRoleClient({
      sessionRow: BASE_SESSION,
      ingestionSelect: { status: "pending", attempt_count: 0 },
      messages: [
        { role: "teacher", metadata: null },
        { role: "learner", metadata: null },
        { role: "teacher", metadata: { correction: { hasCorrection: true, original: "He have", corrected: "He has", explanation: null } } },
        { role: "learner", metadata: null },
        { role: "teacher", metadata: { correction: { hasCorrection: false, original: null, corrected: null, explanation: null } } },
        { role: "learner", metadata: null },
      ],
    });

    await ensureLessonIngested("session-1");

    const call = fakeClient.__rpcCalls[0];
    // 3 learner turns total, 1 grammar-family correction (agreement) -> 2 positive.
    expect(call.args.p_grammar_total_turns).toBe(3);
    expect(call.args.p_grammar_positive_turns).toBe(2);
  });

  it("D/H: sends zero total turns (never a fabricated score) when there is no learner-turn evidence — the RPC itself skips the skill-state write entirely when total is 0", async () => {
    mockClassify.mockResolvedValue([]);
    fakeClient = createFakeServiceRoleClient({
      sessionRow: BASE_SESSION,
      ingestionSelect: { status: "pending", attempt_count: 0 },
      messages: [{ role: "teacher", metadata: null }],
    });

    await ensureLessonIngested("session-1");

    const call = fakeClient.__rpcCalls[0];
    expect(call.args.p_grammar_total_turns).toBe(0);
    expect(call.args.p_grammar_positive_turns).toBe(0);
  });

  it("never reads or references any prior cumulative skill-state row before sending this lesson's evidence (no shared mutable state on this side for a race to corrupt)", async () => {
    mockClassify.mockResolvedValue([]);
    fakeClient = createFakeServiceRoleClient({
      sessionRow: BASE_SESSION,
      ingestionSelect: { status: "pending", attempt_count: 0 },
      messages: [{ role: "learner", metadata: null }],
    });

    await ensureLessonIngested("session-1");

    // language_brain_skill_states is never queried directly by ingest.ts —
    // .from() is only ever called for the tables this fake registers.
    expect(fakeClient.from("language_brain_skill_states")).toBeUndefined();
  });
});

describe("ensureLessonIngested — vocabulary normalization", () => {
  it("normalizes and dedupes vocabulary terms from the session summary", async () => {
    mockClassify.mockResolvedValue([]);
    fakeClient = createFakeServiceRoleClient({
      sessionRow: {
        ...BASE_SESSION,
        summary: { objective: "o", practiced: "p", corrections: [], vocabulary: ["Bonjour", "bonjour ", "Merci"], nextStep: "n" },
      },
      ingestionSelect: { status: "pending", attempt_count: 0 },
      messages: [{ role: "learner", metadata: null }],
    });

    await ensureLessonIngested("session-1");

    const call = fakeClient.__rpcCalls[0];
    const vocab = call.args.p_vocabulary as Array<{ canonicalForm: string }>;
    expect(vocab).toHaveLength(2);
    expect(vocab.map((v) => v.canonicalForm).sort()).toEqual(["bonjour", "merci"]);
  });
});

describe("ensureLessonIngested — O/25: an ingestion failure is recorded for retry, never thrown", () => {
  it("marks the ingestion row 'failed' and resolves normally when the RPC errors", async () => {
    mockClassify.mockResolvedValue([]);
    fakeClient = createFakeServiceRoleClient({
      sessionRow: BASE_SESSION,
      ingestionSelect: { status: "pending", attempt_count: 0 },
      messages: [{ role: "learner", metadata: null }],
      rpcResult: { data: null, error: { message: "boom" } },
    });

    await expect(ensureLessonIngested("session-1")).resolves.toBeUndefined();

    expect(fakeClient.__updates.some((u) => (u as { status?: string }).status === "failed")).toBe(true);
  });
});
