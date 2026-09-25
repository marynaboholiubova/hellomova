import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockUpdateSession = vi.fn();
vi.mock("@/lib/supabase/session", () => ({
  updateSession: mockUpdateSession,
}));

const { proxy } = await import("./proxy");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("proxy — protected route cannot be accessed with a stale/cleared session", () => {
  it("redirects /dashboard to /login when there is no user (the state right after logout clears the cookie)", async () => {
    mockUpdateSession.mockResolvedValue({ supabaseResponse: NextResponse.next(), user: null });

    const request = new NextRequest("http://localhost:3000/dashboard");
    const response = await proxy(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirectTo")).toBe("/dashboard");
  });

  it("redirects a nested protected route (e.g. a lesson page) the same way", async () => {
    mockUpdateSession.mockResolvedValue({ supabaseResponse: NextResponse.next(), user: null });

    const request = new NextRequest("http://localhost:3000/dashboard/lessons/abc-123");
    const response = await proxy(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
  });

  it("does NOT redirect an authenticated request to /dashboard (sanity check / regression guard)", async () => {
    const passthrough = NextResponse.next();
    mockUpdateSession.mockResolvedValue({ supabaseResponse: passthrough, user: { id: "user-1" } });

    const request = new NextRequest("http://localhost:3000/dashboard");
    const response = await proxy(request);

    expect(response).toBe(passthrough);
  });

  it("a logged-out user hitting /login is not bounced away (only an authenticated user is)", async () => {
    const passthrough = NextResponse.next();
    mockUpdateSession.mockResolvedValue({ supabaseResponse: passthrough, user: null });

    const request = new NextRequest("http://localhost:3000/login");
    const response = await proxy(request);

    expect(response).toBe(passthrough);
  });
});
