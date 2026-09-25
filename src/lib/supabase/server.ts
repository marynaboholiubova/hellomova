import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Matches the cookie name(s) @supabase/ssr's own cookie storage adapter
 * uses for the auth session: `sb-<project-ref>-auth-token`, optionally
 * split into numbered chunks (`.0`, `.1`, ...) when the session is large.
 * This is Supabase's own documented naming convention, not a guess — see
 * @supabase/ssr's `createStorageFromOptions`/`isChunkLike`.
 */
const SUPABASE_AUTH_COOKIE_PATTERN = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * Server-side Supabase client for Server Components, Server Actions, and
 * Route Handlers. Never import this from a Client Component.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render, where cookies can't be
            // set. Session refresh already happens in the proxy, so this is
            // safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Unconditionally clears any Supabase auth cookie on the current request,
 * regardless of what `supabase.auth.signOut()` reported.
 *
 * `signOut()` cannot be trusted to have actually cleared the session in
 * every case: verified against @supabase/auth-js's `GoTrueClient` that
 * when the stored access token has already expired AND the network call
 * needed to refresh/validate it fails or is unreachable, `signOut()`
 * resolves with `error: null` while leaving the session cookie completely
 * untouched — the SDK deliberately avoids destroying a possibly-still-valid
 * session on what might be a transient network blip. That's reasonable
 * default behavior for incidental session reads, but wrong for an
 * explicit "Log out" click: the user must end up logged out regardless of
 * whether the best-effort server-side revocation succeeded. Call this
 * AFTER `signOut()` in the logout Server Action as a deterministic
 * backstop — see `logoutAction` in `src/features/auth/actions.ts`.
 */
export async function clearSupabaseAuthCookies(): Promise<void> {
  const cookieStore = await cookies();

  for (const cookie of cookieStore.getAll()) {
    if (SUPABASE_AUTH_COOKIE_PATTERN.test(cookie.name)) {
      cookieStore.set(cookie.name, "", { path: "/", maxAge: 0, sameSite: "lax" });
    }
  }
}
