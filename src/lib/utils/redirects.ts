/**
 * Guards against open-redirect: only ever allow a same-origin relative
 * path as a post-login redirect target. Rejects protocol-relative
 * ("//evil.com"), absolute ("https://evil.com"), and anything else that
 * isn't a plain "/path" — validate here, at the point a redirect is
 * actually issued, not at the point the value was captured (it may have
 * come straight from a URL query param an attacker controls).
 */
export function getSafeRedirectPath(
  candidate: FormDataEntryValue | string | null | undefined,
  fallback: string,
): string {
  if (typeof candidate !== "string") {
    return fallback;
  }

  if (
    candidate.length === 0 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("://")
  ) {
    return fallback;
  }

  return candidate;
}
