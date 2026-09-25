import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAll = vi.fn();
const mockSet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: mockGetAll,
    set: mockSet,
  })),
}));

const { clearSupabaseAuthCookies } = await import("./server");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("clearSupabaseAuthCookies", () => {
  it("clears a plain Supabase auth-token cookie", async () => {
    mockGetAll.mockReturnValue([{ name: "sb-abcdefgh-auth-token", value: "some-session-value" }]);

    await clearSupabaseAuthCookies();

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith("sb-abcdefgh-auth-token", "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    });
  });

  it("clears every chunk of a large, chunked auth-token cookie", async () => {
    mockGetAll.mockReturnValue([
      { name: "sb-abcdefgh-auth-token.0", value: "chunk0" },
      { name: "sb-abcdefgh-auth-token.1", value: "chunk1" },
      { name: "sb-abcdefgh-auth-token.2", value: "chunk2" },
    ]);

    await clearSupabaseAuthCookies();

    expect(mockSet).toHaveBeenCalledTimes(3);
    for (const suffix of [".0", ".1", ".2"]) {
      expect(mockSet).toHaveBeenCalledWith(`sb-abcdefgh-auth-token${suffix}`, "", {
        path: "/",
        maxAge: 0,
        sameSite: "lax",
      });
    }
  });

  it("never touches cookies unrelated to Supabase auth", async () => {
    mockGetAll.mockReturnValue([
      { name: "theme", value: "dark" },
      { name: "some-other-app-cookie", value: "x" },
      { name: "sb-abcdefgh-not-quite-auth-token-prefix", value: "y" },
    ]);

    await clearSupabaseAuthCookies();

    expect(mockSet).not.toHaveBeenCalled();
  });

  it("is a safe no-op when there is nothing to clear", async () => {
    mockGetAll.mockReturnValue([]);

    await expect(clearSupabaseAuthCookies()).resolves.toBeUndefined();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("clears only the matching cookies out of a mixed set", async () => {
    mockGetAll.mockReturnValue([
      { name: "theme", value: "dark" },
      { name: "sb-abcdefgh-auth-token", value: "session" },
    ]);

    await clearSupabaseAuthCookies();

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith("sb-abcdefgh-auth-token", "", expect.any(Object));
  });
});
