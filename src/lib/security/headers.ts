const isDev = process.env.NODE_ENV === "development";

// No nonce: nonces would force every page into dynamic rendering. This is
// the documented "static CSP" tradeoff, matched to a phase where most
// routes should stay statically renderable. Revisit with a nonce-based
// proxy CSP once pages that need it (checkout, sensitive dashboards) exist.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

export const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Browsers ignore this header entirely over plain HTTP, so it's safe to
  // always send — it only takes effect once the app is served over HTTPS.
  // No "preload": that requires a formal submission and is hard to undo.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // Revisit "microphone=()" once pronunciation coaching ships — it will
  // need to allow the mic on same-origin.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
];
