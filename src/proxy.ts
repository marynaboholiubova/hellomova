import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";
import { ROUTES, PROTECTED_ROUTE_PREFIXES, AUTH_ONLY_ROUTES } from "@/constants/routes";

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Match the exact route or a nested path under it — a plain startsWith
  // would also match an unrelated future sibling like "/dashboard-preview".
  const isProtectedRoute = PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isAuthOnlyRoute = AUTH_ONLY_ROUTES.includes(pathname);

  if (isProtectedRoute && !user) {
    const redirectUrl = new URL(ROUTES.login, request.url);
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthOnlyRoute && user) {
    return NextResponse.redirect(new URL(ROUTES.dashboard, request.url));
  }

  return supabaseResponse;
}

// Note for future protected Route Handlers under PROTECTED_ROUTE_PREFIXES:
// an unauthenticated request here gets an HTML redirect, not a JSON 401.
// A fetch-based API client will silently follow it. If a protected API
// route is added, either exclude it from this matcher and let its own
// DAL check return a proper 401, or branch on the Accept header here.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
