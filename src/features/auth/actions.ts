"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    return { message: toSafeErrorMessage(error, GENERIC_ERROR_MESSAGE) };
  }

  if (data.session) {
    redirect(ROUTES.dashboard);
  }

  return { message: "Check your email to confirm your account." };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(ROUTES.login);
}
