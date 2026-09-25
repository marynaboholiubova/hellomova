"use server";

import { redirect } from "next/navigation";
import { createClient, clearSupabaseAuthCookies } from "@/lib/supabase/server";
import { ROUTES } from "@/constants/routes";
import { LoginSchema, SignupSchema } from "./schemas";
import type { AuthFormState } from "./types";
import {
  AUTH_ERROR_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  toSafeErrorMessage,
} from "@/lib/utils/errors";
import { getSafeRedirectPath } from "@/lib/utils/redirects";

export async function loginAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const validated = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  // Extension point: rate-limit sign-in attempts by email/IP here before
  // calling Supabase, once a rate limiter is introduced.
  const { error } = await supabase.auth.signInWithPassword(validated.data);

  if (error) {
    return { message: toSafeErrorMessage(error, AUTH_ERROR_MESSAGE) };
  }

  // Extension point: audit-log successful sign-ins here (user id only —
  // never log credentials).
  redirect(getSafeRedirectPath(formData.get("redirectTo"), ROUTES.dashboard));
}

export async function signupAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const validated = SignupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  // Extension point: rate-limit sign-up attempts by IP here before calling
  // Supabase, once a rate limiter is introduced.
  const { data, error } = await supabase.auth.signUp(validated.data);

  if (error) {
    // These two codes get a distinct, still-safe message instead of the
    // fully generic fallback — never the raw Supabase error either way
    // (toSafeErrorMessage logs the real error server-side only):
    //  - over_email_send_rate_limit: Supabase's own email-sending quota
    //    (the built-in/default provider is heavily throttled — a real
    //    production project needs a custom SMTP provider configured in
    //    the Supabase dashboard). A generic "something went wrong" here
    //    is actively misleading: retrying immediately cannot succeed,
    //    only waiting can. Verified against this exact project.
    //  - user_already_exists / email_exists: an equivocal nudge toward
    //    logging in instead, without explicitly confirming the email is
    //    registered (avoids a clean account-enumeration oracle beyond
    //    what Supabase's own response already implies).
    if (error.code === "over_email_send_rate_limit") {
      return {
        message: toSafeErrorMessage(
          error,
          "We're sending a lot of confirmation emails right now — please wait a few minutes and try again.",
        ),
      };
    }
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return {
        message: toSafeErrorMessage(
          error,
          "We couldn't create that account. If you already have one, try logging in instead.",
        ),
      };
    }
    return { message: toSafeErrorMessage(error, GENERIC_ERROR_MESSAGE) };
  }

  if (data.session) {
    // Straight to the first onboarding step — a brand-new profile row
    // (created by the handle_new_user trigger) always starts at
    // onboarding_step = 'native-language', so this never needs a fresh
    // profile read. (DashboardLayout would also redirect here anyway if
    // sent to /dashboard first, since onboarding isn't complete — this
    // just avoids that extra hop for a signup that authenticates immediately.)
    redirect(ROUTES.onboardingNativeLanguage);
  }

  return { message: "Check your email to confirm your account." };
}

export async function logoutAction() {
  const supabase = await createClient();

  try {
    await supabase.auth.signOut();
  } catch (error) {
    // An unexpected thrown failure (as opposed to a returned `{ error }`)
    // must not block the user from actually being logged out — logged
    // server-side only, never surfaced to the client.
    console.error(error);
  }

  // Defense in depth: signOut() cannot be trusted to have actually
  // cleared the cookie in every case (see clearSupabaseAuthCookies's own
  // comment for the specific, verified gap — an expired access token
  // combined with an unreachable/failing token-refresh call resolves
  // signOut() with `error: null` while leaving the cookie untouched). A
  // user who explicitly clicked "Log out" must end up logged out
  // regardless of what signOut() reports.
  await clearSupabaseAuthCookies();

  redirect(ROUTES.login);
}
