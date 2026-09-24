import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ErrorPatternRecord } from "./dal";

const mockEnsureLessonIngested = vi.fn();
vi.mock("./ingest", () => ({
  ensureLessonIngested: mockEnsureLessonIngested,
}));

let fakeSessionsData: Array<{ id: string }> = [];
let fakeIngestionsData: Array<{ lesson_session_id: string; status: string }> = [];

function chain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: () => obj,
    in: () => obj,
    order: () => obj,
    limit: () => obj,
    maybeSingle: () => obj,
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === "lesson_sessions") return chain({ data: fakeSessionsData, error: null });
      if (table === "language_brain_ingestions") return chain({ data: fakeIngestionsData, error: null });
      return chain({ data: [], error: null });
    },
  }),
}));

const { rankWeakAreas, rankRecentPatterns, ensureRecentLessonsIngested } = await import("./dal");

function pattern(overrides: Partial<ErrorPatternRecord>): ErrorPatternRecord {
  return {
    id: "id",
    category: "grammar",
    patternKey: "pattern",
    exampleOriginal: "orig",
    exampleCorrected: "corr",
    explanation: null,
    occurrenceCount: 1,
    isRecurring: false,
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("rankWeakAreas", () => {
  it("puts recurring patterns ahead of non-recurring ones regardless of recency", () => {
    const nonRecurringRecent = pattern({ id: "a", isRecurring: false, lastSeenAt: "2026-02-01T00:00:00.000Z" });
    const recurringOlder = pattern({ id: "b", isRecurring: true, occurrenceCount: 2, lastSeenAt: "2026-01-01T00:00:00.000Z" });

    const ranked = rankWeakAreas([nonRecurringRecent, recurringOlder]);

    expect(ranked[0].id).toBe("b");
  });

  it("breaks ties among recurring patterns by higher occurrence count", () => {
    const twice = pattern({ id: "twice", isRecurring: true, occurrenceCount: 2 });
    const fiveTimes = pattern({ id: "five", isRecurring: true, occurrenceCount: 5 });

    const ranked = rankWeakAreas([twice, fiveTimes]);

    expect(ranked[0].id).toBe("five");
  });

  it("a single one-off mistake never outranks a recurring pattern (avoids one-off noise dominating)", () => {
    const oneOff = pattern({ id: "one-off", isRecurring: false, occurrenceCount: 1, lastSeenAt: "2026-03-01T00:00:00.000Z" });
    const recurring = pattern({ id: "recurring", isRecurring: true, occurrenceCount: 2, lastSeenAt: "2026-01-01T00:00:00.000Z" });

    const ranked = rankWeakAreas([oneOff, recurring]);

    expect(ranked[0].id).toBe("recurring");
  });
});

describe("rankRecentPatterns", () => {
  it("orders purely by recency, recurring or not", () => {
    const older = pattern({ id: "older", lastSeenAt: "2026-01-01T00:00:00.000Z" });
    const newer = pattern({ id: "newer", lastSeenAt: "2026-02-01T00:00:00.000Z" });

    const ranked = rankRecentPatterns([older, newer]);

    expect(ranked.map((p) => p.id)).toEqual(["newer", "older"]);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  fakeSessionsData = [];
  fakeIngestionsData = [];
});

describe("ensureRecentLessonsIngested — O/25: self-healing retry sweep", () => {
  it("retries ingestion for a completed session with no ingestion record at all", async () => {
    fakeSessionsData = [{ id: "session-1" }];
    fakeIngestionsData = [];

    await ensureRecentLessonsIngested("user-1", "fr");

    expect(mockEnsureLessonIngested).toHaveBeenCalledWith("session-1");
  });

  it("retries ingestion for a session whose ingestion record is 'failed', not 'completed'", async () => {
    fakeSessionsData = [{ id: "session-1" }];
    fakeIngestionsData = [{ lesson_session_id: "session-1", status: "failed" }];

    await ensureRecentLessonsIngested("user-1", "fr");

    expect(mockEnsureLessonIngested).toHaveBeenCalledWith("session-1");
  });

  it("A: does not re-trigger ingestion for a session already marked 'completed'", async () => {
    fakeSessionsData = [{ id: "session-1" }];
    fakeIngestionsData = [{ lesson_session_id: "session-1", status: "completed" }];

    await ensureRecentLessonsIngested("user-1", "fr");

    expect(mockEnsureLessonIngested).not.toHaveBeenCalled();
  });

  it("does nothing when the user has no completed sessions for this target language", async () => {
    fakeSessionsData = [];

    await ensureRecentLessonsIngested("user-1", "fr");

    expect(mockEnsureLessonIngested).not.toHaveBeenCalled();
  });
});
