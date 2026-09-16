import "server-only";

/**
 * Generic, safe messages shown to users. Never interpolate raw error
 * messages, database errors, or Supabase error codes into user-facing text.
 */
export const GENERIC_ERROR_MESSAGE =
  "Something went wrong. Please try again.";

export const AUTH_ERROR_MESSAGE = "Invalid email or password.";

/**
 * Logs the real error server-side (for developers) and returns a safe,
 * generic message to send back to the client.
 */
export function toSafeErrorMessage(
  error: unknown,
  fallback: string = GENERIC_ERROR_MESSAGE,
): string {
  console.error(error);
  return fallback;
}
