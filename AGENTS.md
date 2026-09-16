<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HelloMova — Project Rules

**Project:** HelloMova, a premium AI language-learning platform. Phase 1
built the technical foundation (security, auth, database, responsive UI
skeleton); Phase 2 added onboarding (native language → target language →
goal → placement test → CEFR result → personal plan → AI teacher →
dashboard). Do not implement future phases (AI lesson engine, voice,
pronunciation, Language Brain, Business Course, career tools, billing,
multilingual content) without explicit instruction.

`src/constants/languages.ts` holds HelloMova's real, finalized 50-language
launch catalog (with the 5 Arabic dialects modeled as `variantOf: "ar"`).
Do not add, remove, rename, or substitute entries without the same
explicit sign-off that produced this list.

The onboarding screens (native language, target language, goal, placement
test, level result) have had a visual pass matching
`design-references/onboarding/` — colors, radii, and the primary indigo
token in `src/styles/tokens.css` were adjusted to match those screenshots,
not invented. The teacher and dashboard/home screens have **no reference
screenshot yet** — they reuse the same tokens/components for a coherent
look, but haven't been visually verified against a real mockup. Redo them
if/when a teacher or home export arrives.

Two things the Figma exports revealed differ from this brief's wording —
already resolved with the user, do not re-litigate:

- The Figma goal screen shows 6 options with different wording
  ("Everyday conversation", "Work & Business" merged) vs. this brief's 7
  (General, Travel, Work, Business, Job Interview, Study, Relocation).
  **Decision: keep the 7 goals as specified here** — `goals.ts` and the
  `0002_onboarding.sql` CHECK constraint are correct as built.
  Figma's copy for this screen has not been reconciled with this decision.
- The Figma placement-test screen says "adaptive test" over 18 questions
  covering "vocabulary, grammar, listening and speaking." **Decision:
  keep the Phase 2 scope as built** — a deterministic, level-tagged
  vocabulary/grammar/reading bank per target language (see below), no
  adaptive logic, no voice (per the "do not implement" list). On-screen
  copy must not claim otherwise.

### Placement test — terminology and level ceiling (Phase 2.1 correction)

A real user test found the placement test testing the wrong language
(always English, regardless of target language) and awarding a high
CEFR level from easy items. Both are fixed; the following rules exist
specifically to prevent regressing either one:

- **Never call this "calibrated," "validated," or "certified."** These
  are 3-item-per-level, hand-authored, level-tagged banks that have not
  undergone psychometric or linguistic validation. Use "CEFR-aligned
  placement bank," "CEFR-aligned estimated placement," or "level-tagged
  question bank." Keep "**Estimated CEFR level**" in user-facing copy —
  that one is accurate and stays. "Not a certified evaluation" (a
  negation) is fine; claiming certification is not.
- **The bank is always resolved server-side from the user's actual
  primary target language** (`getPlacementBank()` in
  `src/lib/placement/questions.ts`) — never from client input, and it is
  never substituted with a different language's content. A target
  language with no authored bank gets an honest "not available yet"
  screen, never a wrong-language test.
- **There is no fake fallback level.** A learner who hasn't taken a real
  test has `user_languages.current_cefr_level = null` — "not assessed
  yet" — not an invented A1. `result`/`personal-plan`/the dashboard must
  all distinguish assessed vs. not-assessed explicitly; never silently
  omit the level when it's null.
- **C1 is the ceiling.** `getPlacementBank()` filters C2-tagged items out
  before serving a bank, and `scorePlacementTest()` independently never
  credits C2 either (defense in depth — see `MAX_SERVED_LEVEL` and
  `LEVELS_ELIGIBLE_FOR_CREDIT`). Three multiple-choice items isn't enough
  evidence to responsibly award C2. Don't change this without genuinely
  richer evidence-gathering (adaptive items, writing, speech) backing it.
- **Every real attempt records `test_version`** (e.g. `"en-v1"`,
  `"fr-v1"`), resolved server-side the same way as the bank itself, so
  historical results stay interpretable if a bank is later revised.
- Automated tests for the scoring/validation logic live in
  `src/lib/placement/*.test.ts` and `src/lib/onboarding/schemas.test.ts`
  — run with `npm run test`. Any change to `scoring.ts` or the bank
  validation schemas should keep these passing.

## Stack

- Next.js 16 (App Router) + React 19, TypeScript strict mode.
- CSS Modules only — do not add Tailwind or another styling system.
- Mobile-first responsive design. Reference layout widths: 390px (mobile),
  834px (tablet), 1440px (desktop). These are not hardcoded breakpoints to
  copy everywhere — build fluid layouts and use them as reference widths.
- Supabase for auth + Postgres. `@supabase/ssr` for browser/server clients.

## Security (non-negotiable)

- The browser/frontend is **untrusted**. Never use `if (user)` in a
  component as the security boundary.
- All authorization happens server-side, via the Data Access Layer in
  `src/lib/auth/dal.ts` (`verifySession`, `getCurrentUser`). Every
  protected page, Server Action, and Route Handler that touches user data
  must call it directly — a parent layout's check does not propagate to
  Server Actions or route handlers reachable underneath it.
- `src/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`) only
  does optimistic, cookie-based redirects for UX. It is not the
  authorization boundary.
- Supabase Row Level Security is required on every table. No broad public
  SELECT/INSERT/UPDATE policies — scope everything to `auth.uid()`.
- Never expose the Supabase service-role key to the browser, in a Client
  Component, or via a `NEXT_PUBLIC_` variable.
- Never leak raw database or auth provider errors to users — return
  generic, safe messages (see `src/lib/utils/errors.ts`) and log details
  server-side only.
- Post-login redirect targets (or any other redirect built from
  user-controlled input) must go through `getSafeRedirectPath`
  (`src/lib/utils/redirects.ts`) — never `redirect()` a raw query param or
  form value directly. It only allows same-origin relative paths.
- Rate limiting and audit logging are not implemented yet. The intended
  attachment points are marked with `// Extension point:` comments next
  to the Supabase Auth calls in `src/features/auth/actions.ts` — wire a
  real limiter/logger in there rather than scattering ad hoc checks.
- Onboarding's authorization boundary is `requireOnboardingStep()` in
  `src/lib/onboarding/dal.ts`, not `src/proxy.ts` and not a parent layout.
  Every onboarding page **and every onboarding Server Action** calls it
  for its own step — Server Actions are directly POST-able endpoints, so
  an action must re-check the step itself rather than trust that the page
  which normally renders it was reached in order.
- Every onboarding enum value (language code, goal, teacher id, CEFR
  level, placement answers) is validated by Zod against the exact known
  set in `src/lib/onboarding/schemas.ts`, and mirrored by a Postgres CHECK
  constraint in `supabase/migrations/0002_onboarding.sql`. If you add a
  new goal/teacher/step value, update both, plus the corresponding
  catalog in `src/constants/`.

### Route Handlers (`src/app/**/route.ts`)

None exist yet, but when one is added it must call the DAL itself — a
parent layout's check does not protect it:

```ts
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/dal";

export async function GET() {
  const { user } = await verifySession(); // redirects if unauthenticated
  // ...fetch/return only what belongs to `user`, scoped by RLS + explicit
  // ownership checks — never trust a client-supplied id without verifying
  // it belongs to `user`.
  return NextResponse.json({ ok: true });
}
```

If the route is meant for non-browser clients (no redirect-to-HTML), use
`getCurrentUser()` instead and return a `401 Response` yourself. Also add
the route to (or deliberately exclude it from, with a comment why) the
prefix lists in `src/constants/routes.ts` so `src/proxy.ts` behaves
predictably for it.

## Conventions

- Prefer Server Components; use `"use client"` only where interactivity
  requires it.
- Reuse the components in `src/components/ui` and `src/components/layout`
  instead of duplicating markup/styles.
- Keep `features/*` modules decoupled — don't reach across feature
  folders except through their public exports.
- No unnecessary dependencies. Justify any new package before adding it.
- Do not redesign existing screens or invent new product features,
  pricing, or scope without explicit instruction.
