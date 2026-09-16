import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

/**
 * Refreshes the Supabase auth cookie on every request that reaches the
 * proxy, and returns the current user for optimistic routing decisions.
 * This is NOT the security boundary — it only prevents stale sessions and
 * pre-filters obviously unauthenticated requests. Real authorization must
 * still happen server-side via the Data Access Layer (see lib/auth/dal.ts).
 */
export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request });

  // Supabase isn't configured (or is still set to placeholder text from
  // .env.example — e.g. `.env.local` copied but never filled in). Fail
  // safe: let public routes render; protected routes still get caught by
  // the DAL, which requires real credentials to authorize anything.
  if (!hasValidSupabaseConfig()) {
    return { supabaseResponse, user: null };
  }

  return updateSessionWithSupabase(request, supabaseResponse);
}

function hasValidSupabaseConfig(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return false;
  }

  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

async function updateSessionWithSupabase(
  request: NextRequest,
  initialResponse: NextResponse,
) {
  let supabaseResponse = initialResponse;

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not add code between createServerClient and getUser(): the session
  // refresh must happen before anything else reads or redirects on it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user };
}
