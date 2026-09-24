import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * sendLessonMessageAction's own control flow (ownership/status checks,
 * and which context it builds for the AI call) is real business logic
 * and is exercised for real below. Only its external I/O collaborators
 * are mocked — the lesson DAL, the onboarding DAL, the Supabase client,
 * and the AI turn generator — the same boundary the placement-test suite
 * already mocks the AI provider at, not the business rules themselves.
 * There is no test database available in this environment; see the
 * Phase 3 report for what that leaves untested (ownership enforcement
 * is RLS + a query filter, code-reviewed rather than integration-tested).
 */

const mockGetOwnedLessonSession = vi.fn();
const mockListRecentLessonMessages = vi.fn();
vi.mock("@/lib/lessons/dal", () => ({
  getOwnedLessonSession: mockGetOwnedLessonSession,
  listRecentLessonMessages: mockListRecentLessonMessages,
}));

const mockCheckLessonMessageRateLimit = vi.fn();
vi.mock("@/lib/lessons/rateLimit", () => ({
  checkLessonMessageRateLimit: mockCheckLessonMessageRateLimit,
  checkStartLessonRateLimit: vi.fn(),
}));

const mockGenerateLessonTurn = vi.fn();
vi.mock("@/lib/lessons/generateTurn", () => ({
  generateLessonTurn: mockGenerateLessonTurn,
}));

const mockGenerateLessonSummary = vi.fn();
vi.mock("@/lib/lessons/generateSummary", () => ({
  generateLessonSummary: mockGenerateLessonSummary,
}));

// Language Brain personalization/ingestion are exercised in their own
// unit tests (src/lib/languageBrain/*.test.ts) against real deterministic
// logic — here they're mocked at the boundary, same as the AI turn
// generator above, so this file stays focused on sendLessonMessageAction's
// own control flow.
const mockBuildLessonPersonalizationContext = vi.fn();
vi.mock("@/lib/languageBrain/personalization", () => ({
  buildLessonPersonalizationContext: mockBuildLessonPersonalizationContext,
}));

const mockEnsureLessonIngested = vi.fn();
vi.mock("@/lib/languageBrain/ingest", () => ({
  ensureLessonIngested: mockEnsureLessonIngested,
}));

// sendLessonMessageAction now performs all its writes via the
// service-role client (@/lib/supabase/serviceRole) — see
// 0005_ai_lesson_engine.sql: lesson_sessions/lesson_messages grant no
// insert/update to the authenticated role at all, so the ordinary
// per-request client (@/lib/supabase/server) is only ever used for reads
// (findReplyForClientTurn) in this module. Mock both boundaries.
const mockInsert = vi.fn();
vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: () => ({
      insert: mockInsert,
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null }) }),
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    }),
  })),
}));

vi.mock("@/lib/onboarding/dal", () => ({
  getOnboardingProfile: vi.fn(),
  getPrimaryUserLanguage: vi.fn(),
}));

const { sendLessonMessageAction } = await import("./actions");

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("sessionId", "123e4567-e89b-12d3-a456-426614174000");
  formData.set("clientTurnId", "223e4567-e89b-12d3-a456-426614174000");
  formData.set("text", "Bonjour, comment ça va ?");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckLessonMessageRateLimit.mockResolvedValue({ allowed: true });
  mockListRecentLessonMessages.mockResolvedValue([]);
  mockInsert.mockResolvedValue({ error: null });
  mockBuildLessonPersonalizationContext.mockResolvedValue(null);
  mockEnsureLessonIngested.mockResolvedValue(undefined);
});

describe("sendLessonMessageAction — A: cannot continue another user's lesson", () => {
  it("treats a session that doesn't resolve (wrong owner or nonexistent) as not found", async () => {
    mockGetOwnedLessonSession.mockResolvedValue(null);

    const result = await sendLessonMessageAction(undefined, buildFormData());

    expect(result).toEqual({ error: "That lesson session couldn't be found." });
    expect(mockGenerateLessonTurn).not.toHaveBeenCalled();
  });
});

describe("sendLessonMessageAction — B: a completed session cannot accept a normal continuation", () => {
  it("rejects a new message on a completed session", async () => {
    mockGetOwnedLessonSession.mockResolvedValue({
      id: "123e4567-e89b-12d3-a456-426614174000",
      userId: "user-1",
      status: "completed",
      targetLanguageCode: "fr",
      nativeLanguageCode: "uk",
      cefrLevel: null,
      learningGoal: "travel",
      teacherId: "anna",
    });

    const result = await sendLessonMessageAction(undefined, buildFormData());

    expect(result).toEqual({ error: "This lesson has already ended." });
    expect(mockGenerateLessonTurn).not.toHaveBeenCalled();
  });
});

describe("sendLessonMessageAction — C/D/E: trusted context, not client input", () => {
  const activeSession = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "user-1",
    status: "active" as const,
    targetLanguageCode: "fr",
    nativeLanguageCode: "uk",
    cefrLevel: null, // deliberately unassessed on the session
    learningGoal: "travel",
    teacherId: "anna",
  };

  beforeEach(() => {
    mockGetOwnedLessonSession.mockResolvedValue(activeSession);
    mockGenerateLessonTurn.mockResolvedValue({
      success: true,
      data: {
        teacherMessage: "Très bien !",
        correction: { hasCorrection: false, original: null, corrected: null, explanation: null },
        lessonState: { objective: "Greetings", turnType: "practice", shouldComplete: false },
      },
    });
    mockGenerateLessonSummary.mockResolvedValue({ success: false, errorMessage: "unused" });
  });

  it("writes the learner and teacher messages via the service-role client, not the ordinary RLS-scoped client (see 0005_ai_lesson_engine.sql: authenticated has no insert grant on lesson_messages)", async () => {
    await sendLessonMessageAction(undefined, buildFormData());

    // Two inserts: the learner's message, then the teacher's reply.
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert.mock.calls[0][0]).toMatchObject({ role: "learner" });
    expect(mockInsert.mock.calls[1][0]).toMatchObject({ role: "teacher" });
  });

  it("C: the context passed to the AI comes from the session's target language, not any client field", async () => {
    const spoofed = buildFormData({ targetLanguageCode: "de" });

    await sendLessonMessageAction(undefined, spoofed);

    expect(mockGenerateLessonTurn).toHaveBeenCalledTimes(1);
    const [contextArg] = mockGenerateLessonTurn.mock.calls[0];
    expect(contextArg.targetLanguageName).toBe("French");
    expect(contextArg.targetLanguageName).not.toBe("German");
  });

  it("D: a client-supplied fake CEFR level is ignored — the session's real (unassessed) value is used", async () => {
    const spoofed = buildFormData({ cefrLevel: "C2" });

    await sendLessonMessageAction(undefined, spoofed);

    const [contextArg] = mockGenerateLessonTurn.mock.calls[0];
    expect(contextArg.cefrLevel).toBeNull();
  });

  it("E: the client cannot change teacher through the message payload", async () => {
    const spoofed = buildFormData({ teacherId: "alex" });

    await sendLessonMessageAction(undefined, spoofed);

    const [contextArg] = mockGenerateLessonTurn.mock.calls[0];
    expect(contextArg.teacher.id).toBe("anna");
    expect(contextArg.teacher.id).not.toBe("alex");
  });

  it("R: Language Brain personalization is always built from the session's own snapshot (user id + target language), never client input", async () => {
    const spoofed = buildFormData({ userId: "someone-else", targetLanguageCode: "de" });

    await sendLessonMessageAction(undefined, spoofed);

    expect(mockBuildLessonPersonalizationContext).toHaveBeenCalledWith("user-1", "fr");
  });
});

describe("sendLessonMessageAction — lesson completion triggers Language Brain ingestion", () => {
  const activeSession = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "user-1",
    status: "active" as const,
    targetLanguageCode: "fr",
    nativeLanguageCode: "uk",
    cefrLevel: null,
    learningGoal: "travel",
    teacherId: "anna",
  };

  beforeEach(() => {
    mockGetOwnedLessonSession.mockResolvedValue(activeSession);
  });

  it("calls ensureLessonIngested when the AI turn marks the lesson complete", async () => {
    mockGenerateLessonTurn.mockResolvedValue({
      success: true,
      data: {
        teacherMessage: "Great work, see you next time!",
        correction: { hasCorrection: false, original: null, corrected: null, explanation: null },
        lessonState: { objective: "Greetings", turnType: "wrap_up", shouldComplete: true },
      },
    });
    mockGenerateLessonSummary.mockResolvedValue({ success: false });

    await sendLessonMessageAction(undefined, buildFormData());

    expect(mockEnsureLessonIngested).toHaveBeenCalledWith(activeSession.id);
  });

  it("does not call ensureLessonIngested when the lesson continues", async () => {
    mockGenerateLessonTurn.mockResolvedValue({
      success: true,
      data: {
        teacherMessage: "Keep going!",
        correction: { hasCorrection: false, original: null, corrected: null, explanation: null },
        lessonState: { objective: "Greetings", turnType: "practice", shouldComplete: false },
      },
    });

    await sendLessonMessageAction(undefined, buildFormData());

    expect(mockEnsureLessonIngested).not.toHaveBeenCalled();
  });
});

// M: duplicate/idempotent submission is deliberately NOT covered here.
// Simulating it faithfully would require a real Postgres unique-constraint
// violation (error code 23505) round-tripping through the mocked insert,
// which would just be asserting that our own mock returns what we told it
// to — not exercising the real constraint. That guarantee instead lives in:
//   - the DB: `unique (lesson_session_id, client_turn_id) where client_turn_id
//     is not null` in 0005_ai_lesson_engine.sql, and
//   - the code path in sendLessonMessageAction that branches on
//     `error.code === "23505"` to call findReplyForClientTurn() and replay
//     the existing result instead of erroring or duplicating.
// This is code-reviewed rather than integration-tested, consistent with
// there being no live test database in this environment.

describe("sendLessonMessageAction — input validation", () => {
  it("rejects an invalid session id before touching the database", async () => {
    const result = await sendLessonMessageAction(
      undefined,
      buildFormData({ sessionId: "not-a-uuid" }),
    );
    expect(result).toEqual({ error: "Invalid lesson session." });
    expect(mockGetOwnedLessonSession).not.toHaveBeenCalled();
  });

  it("rejects an empty message before touching the database", async () => {
    const result = await sendLessonMessageAction(undefined, buildFormData({ text: "   " }));
    expect(result && "error" in result).toBe(true);
    expect(mockGetOwnedLessonSession).not.toHaveBeenCalled();
  });
});
