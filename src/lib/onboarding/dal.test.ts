import { describe, expect, it, vi, beforeEach } from "vitest";

const mockVerifySession = vi.fn();
vi.mock("@/lib/auth/dal", () => ({
  verifySession: mockVerifySession,
}));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

let profileRow: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: profileRow, error: null }),
        }),
      }),
    }),
  })),
}));

const { requireOnboardingStep, onboardingRouteFor } = await import("./dal");

function makeProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    display_name: null,
    native_language_code: null,
    learning_goal: null,
    selected_teacher_id: null,
    onboarding_step: "native-language",
    onboarding_completed_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifySession.mockResolvedValue({ user: { id: "user-1" } });
});

describe("requireOnboardingStep — a brand-new user starts at the very beginning", () => {
  it("a fresh profile (onboarding_step: native-language, never completed) is allowed on the first step without any redirect", async () => {
    profileRow = makeProfileRow();

    const profile = await requireOnboardingStep("native-language");

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(profile.onboardingStep).toBe("native-language");
    expect(profile.onboardingCompletedAt).toBeNull();
  });

  it("a fresh profile cannot skip ahead to a later step it hasn't reached yet", async () => {
    profileRow = makeProfileRow();

    await requireOnboardingStep("goal");

    expect(mockRedirect).toHaveBeenCalledWith(onboardingRouteFor("native-language"));
  });
});

describe("requireOnboardingStep — an existing user's persisted progress is preserved, never reset by unrelated changes", () => {
  it("a user who already reached 'goal' resumes there directly (no redirect on their own current step)", async () => {
    profileRow = makeProfileRow({ onboarding_step: "goal" });

    await requireOnboardingStep("goal");

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("a user who already reached 'goal' can still revisit an earlier step without being reset — their saved progress (learning_goal, etc.) is untouched by requireOnboardingStep, which only ever reads, never writes", async () => {
    profileRow = makeProfileRow({ onboarding_step: "goal", native_language_code: "en", learning_goal: "travel" });

    const profile = await requireOnboardingStep("native-language");

    // Revisiting an earlier step is allowed (not blocked) — only skipping
    // AHEAD of the saved step is. The saved step itself must still report
    // their real progress, proving nothing was reset by visiting an
    // earlier page.
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(profile.onboardingStep).toBe("goal");
    expect(profile.learningGoal).toBe("travel");
  });

  it("a user who already reached 'goal' is blocked from skipping further AHEAD (e.g. straight to 'teacher') until they actually reach it", async () => {
    profileRow = makeProfileRow({ onboarding_step: "goal" });

    await requireOnboardingStep("teacher");

    expect(mockRedirect).toHaveBeenCalledWith(onboardingRouteFor("goal"));
  });

  it("a fully completed user is sent to the dashboard, never back through onboarding again", async () => {
    profileRow = makeProfileRow({
      onboarding_step: "completed",
      onboarding_completed_at: "2026-01-01T00:00:00.000Z",
    });

    await requireOnboardingStep("native-language");

    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });
});
