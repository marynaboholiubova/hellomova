import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/constants/routes";

/**
 * Verifies the caller has an authenticated session, revalidating the token
 * against Supabase Auth (not just decoding the cookie). This is the actual
 * authorization boundary — call it from every protected page, layout,
 * Server Action, or Route Handler that reads or mutates user data. The
 * proxy's redirect is only a UX optimization and must not be relied on
 * as the sole guard.
 */
export const verifySession = cache(async (): Promise<{ user: User }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect(ROUTES.login);
  }

  return { user: data.user };
});

/** Returns the current user, or null if there is no session. Does not redirect. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});
