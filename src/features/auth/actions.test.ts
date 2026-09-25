import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockSignOut = vi.fn();
const mockSignUp = vi.fn();
const mockCreateClient = vi.fn(async () => ({
  auth: { signOut: mockSignOut, signUp: mockSignUp },
}));
const mockClearSupabaseAuthCookies = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
  clearSupabaseAuthCookies: mockClearSupabaseAuthCookies,
}));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

const { logoutAction, signupAction } = await import("./actions");

function buildSignupFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("email", "new.user@example.com");
  formData.set("password", "ValidPass123");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSignOut.mockResolvedValue({ error: null });
  mockSignUp.mockResolvedValue({ data: { session: null, user: null }, error: null });
});

describe("logoutAction — invalidates the session", () => {
  it("calls supabase.auth.signOut()", async () => {
    await logoutAction();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("always clears the Supabase auth cookie afterward, regardless of signOut()'s reported result", async () => {
    await logoutAction();

    expect(mockClearSupabaseAuthCookies).toHaveBeenCalledTimes(1);
  });

  it("still clears the cookie even when signOut() reports an error (the verified gap this defends against)", async () => {
    mockSignOut.mockResolvedValue({ error: { message: "Auth session missing!", name: "AuthSessionMissingError" } });

    await logoutAction();

    expect(mockClearSupabaseAuthCookies).toHaveBeenCalledTimes(1);
  });

  it("still clears the cookie even when signOut() resolves with no error at all (the silent-failure case verified against a real Supabase project: an expired access token plus an unreachable refresh call resolves signOut() with error: null and an untouched cookie)", async () => {
    mockSignOut.mockResolvedValue({ error: null });

    await logoutAction();

    expect(mockClearSupabaseAuthCookies).toHaveBeenCalledTimes(1);
  });

  it("clears the cookie AFTER calling signOut(), not before — signOut() is still given the chance to revoke server-side first", async () => {
    const callOrder: string[] = [];
    mockSignOut.mockImplementation(async () => {
      callOrder.push("signOut");
      return { error: null };
    });
    mockClearSupabaseAuthCookies.mockImplementation(async () => {
      callOrder.push("clearCookies");
    });

    await logoutAction();

    expect(callOrder).toEqual(["signOut", "clearCookies"]);
  });

  it("still clears cookies and redirects even if signOut() itself throws (not just returns an error)", async () => {
    mockSignOut.mockRejectedValue(new Error("network error"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await logoutAction();

    expect(mockClearSupabaseAuthCookies).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/login");
    consoleErrorSpy.mockRestore();
  });
});

describe("logoutAction — redirects to /login", () => {
  it("redirects to /login on a normal, successful logout", async () => {
    await logoutAction();

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login even when signOut() reported an error, never showing a raw auth error to the user", async () => {
    mockSignOut.mockResolvedValue({ error: { message: "some internal Supabase detail", name: "AuthApiError" } });

    await logoutAction();

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects only after cookies have actually been cleared", async () => {
    const callOrder: string[] = [];
    mockClearSupabaseAuthCookies.mockImplementation(async () => {
      callOrder.push("clearCookies");
    });
    mockRedirect.mockImplementation(() => {
      callOrder.push("redirect");
    });

    await logoutAction();

    expect(callOrder).toEqual(["clearCookies", "redirect"]);
  });
});

describe("signupAction — invalid input", () => {
  it("rejects an invalid email before ever calling Supabase", async () => {
    const result = await signupAction(undefined, buildSignupFormData({ email: "not-an-email" }));

    expect(result).toEqual({ errors: { email: ["Please enter a valid email."] } });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("rejects a password that fails the strength rules before ever calling Supabase", async () => {
    const result = await signupAction(undefined, buildSignupFormData({ password: "short" }));

    expect(result && "errors" in result && result.errors?.password).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });
});

describe("signupAction — valid new signup, email confirmation required (this project's actual configuration)", () => {
  it("calls supabase.auth.signUp with the validated credentials", async () => {
    await signupAction(undefined, buildSignupFormData({ email: "brand.new@example.com", password: "ValidPass123" }));

    expect(mockSignUp).toHaveBeenCalledWith({ email: "brand.new@example.com", password: "ValidPass123" });
  });

  it("honestly tells the user to confirm their email when signUp succeeds with no session yet", async () => {
    mockSignUp.mockResolvedValue({ data: { session: null, user: { id: "new-user-1" } }, error: null });

    const result = await signupAction(undefined, buildSignupFormData());

    expect(result).toEqual({ message: "Check your email to confirm your account." });
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("signupAction — a newly authenticated signup (email confirmation disabled) goes straight to onboarding", () => {
  it("redirects to the first onboarding step, not the dashboard, when signUp returns a session immediately", async () => {
    mockSignUp.mockResolvedValue({ data: { session: { access_token: "x" }, user: { id: "new-user-1" } }, error: null });

    await signupAction(undefined, buildSignupFormData());

    expect(mockRedirect).toHaveBeenCalledWith("/onboarding/native-language");
    expect(mockRedirect).not.toHaveBeenCalledWith("/dashboard");
  });
});

describe("signupAction — Supabase signup failure: no raw error is ever exposed", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("falls back to a generic message for an unrecognized error, and never leaks the raw Supabase error text", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "some internal Postgres constraint detail", code: "unexpected_failure", name: "AuthApiError" },
    });

    const result = await signupAction(undefined, buildSignupFormData());

    expect(result).toEqual({ message: "Something went wrong. Please try again." });
  });

  it("R: email rate limit exceeded — a distinct, still-safe, actually-helpful message (verified root cause of the real reported bug)", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "email rate limit exceeded", code: "over_email_send_rate_limit", name: "AuthApiError" },
    });

    const result = await signupAction(undefined, buildSignupFormData());

    expect(result).toEqual({
      message: "We're sending a lot of confirmation emails right now — please wait a few minutes and try again.",
    });
  });

  it("existing email (user_already_exists): a safe, equivocal nudge toward logging in, without exposing Supabase's raw error", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "User already registered", code: "user_already_exists", name: "AuthApiError" },
    });

    const result = await signupAction(undefined, buildSignupFormData());

    expect(result).toEqual({
      message: "We couldn't create that account. If you already have one, try logging in instead.",
    });
  });

  it("existing email (email_exists code variant): same safe handling", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Email already exists", code: "email_exists", name: "AuthApiError" },
    });

    const result = await signupAction(undefined, buildSignupFormData());

    expect(result).toEqual({
      message: "We couldn't create that account. If you already have one, try logging in instead.",
    });
  });

  it("never redirects on any signup failure", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "boom", code: "unexpected_failure", name: "AuthApiError" },
    });

    await signupAction(undefined, buildSignupFormData());

    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
