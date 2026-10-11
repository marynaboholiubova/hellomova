import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Mocks every external I/O collaborator (onboarding DAL, pronunciation
 * DAL, rate limiting, provider wrappers, Supabase service-role client) —
 * the same boundary the lesson engine's actions.test.ts mocks at — so
 * this file exercises the actions' OWN real control flow: ownership,
 * input validation, status guards, and idempotency.
 */

const mockGetOnboardingProfile = vi.fn();
const mockGetPrimaryUserLanguage = vi.fn();
vi.mock("@/lib/onboarding/dal", () => ({
  getOnboardingProfile: mockGetOnboardingProfile,
  getPrimaryUserLanguage: mockGetPrimaryUserLanguage,
}));

const mockGetOwnedPronunciationAttempt = vi.fn();
vi.mock("@/lib/pronunciation/dal", () => ({
  getOwnedPronunciationAttempt: mockGetOwnedPronunciationAttempt,
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/pronunciation/rateLimit", () => ({
  checkPronunciationAttemptRateLimit: mockCheckRateLimit,
}));

const mockGenerateTargetPhrase = vi.fn();
vi.mock("@/lib/pronunciation/generatePhrase", () => ({
  generateTargetPhrase: mockGenerateTargetPhrase,
}));

const mockTranscribeAttemptAudio = vi.fn();
const mockEvaluatePronunciationTranscript = vi.fn();
vi.mock("@/lib/pronunciation/evaluate", () => ({
  transcribeAttemptAudio: mockTranscribeAttemptAudio,
  evaluatePronunciationTranscript: mockEvaluatePronunciationTranscript,
}));

// Same additive insert/update fake as lessons/actions.test.ts: `insert`
// and `update` keep their real single-arg call signatures so assertions
// on `mock.calls[n][0]` stay simple, while the returned value supports
// both direct awaiting and `.select().single()`/`.select().maybeSingle()`
// chaining.
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: () => ({
      insert: (payload: unknown) => {
        const resultPromise = Promise.resolve(mockInsert(payload));
        return Object.assign(resultPromise, { select: () => ({ single: () => resultPromise }) });
      },
      update: (payload: unknown) => {
        const resultPromise = Promise.resolve(mockUpdate(payload));
        const chain = {
          eq: () => chain,
          select: () => ({ maybeSingle: () => resultPromise }),
        };
        return chain;
      },
    }),
  })),
}));

const { startPronunciationAttemptAction, submitPronunciationAttemptAction } = await import("./actions");
const { PRONUNCIATION_EVALUATION_LIMITATIONS } = await import("@/lib/pronunciation/schemas");

const VALID_PROFILE = {
  id: "user-1",
  displayName: "Test Learner",
  nativeLanguageCode: "uk",
  learningGoal: "general",
  selectedTeacherId: "anna",
  onboardingStep: "teacher" as const,
  onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
};

const VALID_PRIMARY_LANGUAGE = { targetLanguageCode: "fr", currentCefrLevel: "B1" };

const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";

function makeAudioFile(overrides: { size?: number; type?: string; content?: string } = {}): File {
  const content = overrides.content ?? "fake-audio-bytes";
  const bytes = overrides.size !== undefined ? new Uint8Array(overrides.size) : new TextEncoder().encode(content);
  return new File([bytes], "attempt.webm", { type: overrides.type ?? "audio/webm;codecs=opus" });
}

function buildSubmitFormData(overrides: Record<string, FormDataEntryValue> = {}): FormData {
  const formData = new FormData();
  formData.set("attemptId", ATTEMPT_ID);
  formData.set("audio", makeAudioFile());
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

const PENDING_ATTEMPT = {
  id: ATTEMPT_ID,
  userId: "user-1",
  targetLanguageCode: "fr",
  nativeLanguageCode: "uk",
  cefrLevel: "B1" as const,
  targetText: "Bonjour, comment ça va ?",
  status: "pending" as const,
  transcript: null,
  evaluation: null,
  errorReason: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  completedAt: null,
};

const VALID_EVALUATION = {
  recognitionQuality: "clear" as const,
  contentMatch: "close_match" as const,
  differences: [],
  practiceSuggestion: "Keep it up.",
  recognizedTranscript: "Bonjour comment ça va",
  limitations: PRONUNCIATION_EVALUATION_LIMITATIONS,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOnboardingProfile.mockResolvedValue({ ...VALID_PROFILE });
  mockGetPrimaryUserLanguage.mockResolvedValue({ ...VALID_PRIMARY_LANGUAGE });
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockGenerateTargetPhrase.mockResolvedValue({ success: true, data: { text: "Bonjour, comment ça va ?" } });
  mockInsert.mockResolvedValue({ data: { id: ATTEMPT_ID }, error: null });
  mockUpdate.mockResolvedValue({ data: { id: ATTEMPT_ID }, error: null });
  mockGetOwnedPronunciationAttempt.mockResolvedValue({ ...PENDING_ATTEMPT });
  mockTranscribeAttemptAudio.mockResolvedValue({ success: true, transcript: "Bonjour comment ça va", model: "whisper-1" });
  mockEvaluatePronunciationTranscript.mockResolvedValue({ success: true, data: VALID_EVALUATION, model: "gpt-4o-mini" });
});

describe("startPronunciationAttemptAction", () => {
  it("rejects when onboarding isn't complete, without generating a phrase or inserting a row", async () => {
    mockGetOnboardingProfile.mockResolvedValue({ ...VALID_PROFILE, onboardingCompletedAt: null });

    const result = await startPronunciationAttemptAction(undefined, new FormData());

    expect(result).toEqual({ error: "Please finish onboarding before practicing pronunciation." });
    expect(mockGenerateTargetPhrase).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects when there is no target language yet", async () => {
    mockGetPrimaryUserLanguage.mockResolvedValue(null);

    const result = await startPronunciationAttemptAction(undefined, new FormData());

    expect(result).toEqual({ error: "Please choose a target language before practicing pronunciation." });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("is rate-limited before any provider call is made", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });

    const result = await startPronunciationAttemptAction(undefined, new FormData());

    expect(result).toEqual({ error: "You're sending requests a bit fast — please wait a moment and try again." });
    expect(mockGenerateTargetPhrase).not.toHaveBeenCalled();
  });

  it("propagates an honest error when phrase generation fails, without inserting a row", async () => {
    mockGenerateTargetPhrase.mockResolvedValue({ success: false, errorMessage: "AI unavailable" });

    const result = await startPronunciationAttemptAction(undefined, new FormData());

    expect(result).toEqual({ error: "AI unavailable" });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("creates a pending attempt from only server-trusted profile data — this action reads no form input at all", async () => {
    const result = await startPronunciationAttemptAction(undefined, new FormData());

    expect(result).toEqual({ success: true, attemptId: ATTEMPT_ID, targetText: "Bonjour, comment ça va ?" });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        target_language_code: "fr",
        native_language_code: "uk",
        cefr_level: "B1",
        target_text: "Bonjour, comment ça va ?",
      }),
    );
  });
});

describe("submitPronunciationAttemptAction — input validation", () => {
  it("rejects an invalid attempt id without touching the DAL", async () => {
    const result = await submitPronunciationAttemptAction(undefined, buildSubmitFormData({ attemptId: "not-a-uuid" }));

    expect(result).toEqual({ error: "Invalid pronunciation attempt." });
    expect(mockGetOwnedPronunciationAttempt).not.toHaveBeenCalled();
  });

  it("rejects a request with no audio file", async () => {
    const formData = new FormData();
    formData.set("attemptId", ATTEMPT_ID);

    const result = await submitPronunciationAttemptAction(undefined, formData);

    expect(result).toEqual({ error: "No recording was received. Please try again." });
  });

  it("rejects an empty recording", async () => {
    const formData = buildSubmitFormData();
    formData.set("audio", makeAudioFile({ size: 0 }));

    const result = await submitPronunciationAttemptAction(undefined, formData);

    expect(result).toEqual({ error: "That recording was empty. Please try again." });
    expect(mockTranscribeAttemptAudio).not.toHaveBeenCalled();
  });

  it("rejects an oversized recording without ever calling the provider", async () => {
    const formData = buildSubmitFormData();
    formData.set("audio", makeAudioFile({ size: 10 * 1024 * 1024 + 1 }));

    const result = await submitPronunciationAttemptAction(undefined, formData);

    expect(result).toEqual({ error: "That recording is too long. Please keep it to a short phrase." });
    expect(mockTranscribeAttemptAudio).not.toHaveBeenCalled();
  });

  it("rejects an unsupported MIME type", async () => {
    const formData = buildSubmitFormData();
    formData.set("audio", makeAudioFile({ type: "application/octet-stream" }));

    const result = await submitPronunciationAttemptAction(undefined, formData);

    expect(result).toEqual({ error: "That recording's format isn't supported. Please try again." });
    expect(mockTranscribeAttemptAudio).not.toHaveBeenCalled();
  });

  it("accepts a MIME type with codec parameters (real MediaRecorder output), not just the bare base type", async () => {
    const formData = buildSubmitFormData();
    formData.set("audio", makeAudioFile({ type: "audio/webm;codecs=opus" }));

    const result = await submitPronunciationAttemptAction(undefined, formData);

    expect(result).toMatchObject({ success: true });
  });
});

describe("submitPronunciationAttemptAction — ownership and ignored client-trusted fields", () => {
  it("treats another user's (or nonexistent) attempt as not found, never processing audio for it", async () => {
    mockGetOwnedPronunciationAttempt.mockResolvedValue(null);

    const result = await submitPronunciationAttemptAction(undefined, buildSubmitFormData());

    expect(result).toEqual({ error: "That pronunciation attempt couldn't be found." });
    expect(mockTranscribeAttemptAudio).not.toHaveBeenCalled();
  });

  it("ignores a client-supplied transcript/evaluation/score in form data — only attemptId and audio are ever read", async () => {
    const formData = buildSubmitFormData({
      transcript: "I spoke perfectly",
      evaluation: JSON.stringify({ intelligibility: "clear" }),
      score: "100",
    });

    await submitPronunciationAttemptAction(undefined, formData);

    // The real transcript/evaluation come only from the mocked provider
    // calls below — never from the spoofed form fields.
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: "Bonjour comment ça va", evaluation: VALID_EVALUATION }),
    );
  });
});

describe("submitPronunciationAttemptAction — idempotency", () => {
  it("replays an already-completed attempt's real persisted result without re-calling the provider", async () => {
    mockGetOwnedPronunciationAttempt.mockResolvedValue({
      ...PENDING_ATTEMPT,
      status: "completed",
      transcript: "Bonjour comment ça va",
      evaluation: VALID_EVALUATION,
      completedAt: "2026-01-01T00:01:00.000Z",
    });

    const result = await submitPronunciationAttemptAction(undefined, buildSubmitFormData());

    expect(result).toEqual({ success: true, status: "completed", transcript: "Bonjour comment ça va", evaluation: VALID_EVALUATION });
    expect(mockTranscribeAttemptAudio).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("replays an already-failed attempt's real reason without re-calling the provider", async () => {
    mockGetOwnedPronunciationAttempt.mockResolvedValue({
      ...PENDING_ATTEMPT,
      status: "failed",
      errorReason: "Couldn't process your recording right now. Please try again shortly.",
      completedAt: "2026-01-01T00:01:00.000Z",
    });

    const result = await submitPronunciationAttemptAction(undefined, buildSubmitFormData());

    expect(result).toEqual({ success: true, status: "failed", errorReason: "Couldn't process your recording right now. Please try again shortly." });
    expect(mockTranscribeAttemptAudio).not.toHaveBeenCalled();
  });

  it("when the final guarded UPDATE loses a race (0 rows matched), replays the concurrent winner's real result instead of the discarded local computation", async () => {
    mockUpdate.mockResolvedValue({ data: null, error: null });
    mockGetOwnedPronunciationAttempt
      .mockResolvedValueOnce({ ...PENDING_ATTEMPT }) // initial ownership/status read
      .mockResolvedValueOnce({
        ...PENDING_ATTEMPT,
        status: "completed",
        transcript: "a concurrent winner's transcript",
        evaluation: VALID_EVALUATION,
        completedAt: "2026-01-01T00:01:00.000Z",
      });

    const result = await submitPronunciationAttemptAction(undefined, buildSubmitFormData());

    expect(result).toEqual({
      success: true,
      status: "completed",
      transcript: "a concurrent winner's transcript",
      evaluation: VALID_EVALUATION,
    });
  });
});

describe("submitPronunciationAttemptAction — happy path and provider failures", () => {
  it("transcribes, evaluates, and persists a completed result with real provider provenance", async () => {
    const result = await submitPronunciationAttemptAction(undefined, buildSubmitFormData());

    expect(result).toEqual({ success: true, status: "completed", transcript: "Bonjour comment ça va", evaluation: VALID_EVALUATION });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        transcript: "Bonjour comment ça va",
        evaluation: VALID_EVALUATION,
        transcription_model: "whisper-1",
        evaluation_model: "gpt-4o-mini",
      }),
    );
  });

  it("marks the attempt failed (never fabricating a result) when transcription fails, and never calls evaluation", async () => {
    mockTranscribeAttemptAudio.mockResolvedValue({ success: false, errorMessage: "Couldn't process your recording right now. Please try again shortly." });

    const result = await submitPronunciationAttemptAction(undefined, buildSubmitFormData());

    expect(result).toEqual({ success: true, status: "failed", errorReason: "Couldn't process your recording right now. Please try again shortly." });
    expect(mockEvaluatePronunciationTranscript).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("marks the attempt failed but keeps the real transcript when only evaluation fails", async () => {
    mockEvaluatePronunciationTranscript.mockResolvedValue({ success: false, errorMessage: "Couldn't evaluate your recording right now. Please try again shortly." });

    const result = await submitPronunciationAttemptAction(undefined, buildSubmitFormData());

    expect(result).toEqual({ success: true, status: "failed", errorReason: "Couldn't evaluate your recording right now. Please try again shortly." });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", transcript: "Bonjour comment ça va" }),
    );
  });
});
