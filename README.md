# HelloMova

HelloMova is a premium AI language-learning platform. This repository is
currently at **Phase 2: Onboarding**, on top of the Phase 1 security/auth/
database foundation. The AI lesson engine, voice, pronunciation coaching,
Language Brain, Business Course, career tools, billing, and multilingual
content are **not** built yet; they are future phases.

> The onboarding screens have had a visual pass matching
> `design-references/onboarding/` (colors, spacing, hierarchy) — but only
> 5 of 7 screens have a reference screenshot (teacher and home don't yet;
> those two reuse the same tokens for a coherent look but aren't verified
> against a real mockup). The language catalog is final — see
> `src/constants/languages.ts`. The placement test tests the user's
> **target** language (not always English) and never fabricates a CEFR
> level — see "Placement test" under "Current phase" below.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19, TypeScript
  (strict mode), React Compiler enabled.
- CSS Modules for styling (no Tailwind, by design).
- [Supabase](https://supabase.com) for authentication and Postgres,
  accessed via `@supabase/ssr`.
- [Zod](https://zod.dev) for server-side input validation.

> Note: this Next.js version renamed `middleware.ts` to `proxy.ts` (see
> `src/proxy.ts`) and changed some other App Router conventions. See
> `AGENTS.md` before making framework-level changes.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase project values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Copy `.env.example` to `.env.local` (already git-ignored) and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — your Supabase publishable key.

Both are safe to expose to the browser: access is enforced by Postgres Row
Level Security, not by keeping these secret. **Never** add the Supabase
service-role key to this project's environment files or to any
`NEXT_PUBLIC_`-prefixed variable.

## Supabase setup (manual steps)

1. Create a Supabase project (or use an existing one).
2. Copy its Project URL and publishable key into `.env.local`.
3. Run the SQL in `supabase/migrations/0001_init.sql`, then
   `0002_onboarding.sql`, then `0003_placement_category_breakdown.sql`,
   then `0004_placement_test_version.sql`, against your project **in
   that order** — either paste them into the Supabase SQL editor, or
   apply them with the Supabase CLI (`supabase db push`) if you use one.
4. In Authentication settings, decide whether email confirmation is
   required for sign-up (the sign-up flow already handles both cases).
5. No service-role key is needed for anything in this phase.

`0001_init.sql` creates `profiles` and `user_languages` with Row Level
Security scoped to `auth.uid()` on both, plus a trigger that auto-creates
a `profiles` row when a new `auth.users` row is inserted. `0002_onboarding.sql`
adds the onboarding columns to `profiles`, a `placement_test_attempts`
table (RLS scoped the same way), and CHECK constraints on every
enum-shaped column as defense in depth alongside the app-level Zod
validation. `0003_placement_category_breakdown.sql` adds one additive
`jsonb` column to `placement_test_attempts` for the level-result screen's
per-category (vocabulary/grammar/reading) breakdown. `0004_placement_test_version.sql`
adds a `test_version` column (e.g. `"en-v1"`) so historical attempts stay
interpretable if a bank is ever revised — always resolved server-side,
never accepted from the client.

## Current phase

**Phase 2 — Onboarding**, on top of Phase 1 (Foundation + Security + Auth +
Database + Responsive UI Skeleton).

Phase 1, still in place:

- Route groups: `(marketing)` public site, `(auth)` login/signup,
  `(dashboard)` protected shell.
- Sign up, log in, log out via Supabase Auth, with server-side validated
  forms (`src/features/auth`).
- A Data Access Layer (`src/lib/auth/dal.ts`) as the real authorization
  boundary — `src/proxy.ts` only does optimistic redirects.
- Responsive layout primitives (`AppShell`, `Container`, `Sidebar`,
  `BottomNav`) built mobile-first around 390 / 834 / 1440px reference
  widths.
- A small design-token system (`src/styles/tokens.css`) and core UI
  components (`Button`, `Input`, `Card`).
- Security headers and a CSP foundation (`next.config.ts`,
  `src/lib/security/headers.ts`).

Phase 2, new in this pass — the onboarding flow: native language → target
language → goal → placement test → CEFR result → personal plan → AI
teacher → dashboard.

- Routes under `src/app/(onboarding)/onboarding/*`, all requiring
  authentication (`/onboarding` is in `PROTECTED_ROUTE_PREFIXES`).
- `src/lib/onboarding/dal.ts` (`requireOnboardingStep`) is the real
  authorization boundary for every onboarding page **and** every
  onboarding Server Action — Server Actions are directly POST-able
  endpoints, so each one re-checks its own step rather than trusting that
  the page that rendered it was reached legitimately.
- `profiles.onboarding_step` / `onboarding_completed_at` track resume
  state; a user who leaves mid-flow and returns lands back on their
  actual current step, a user who jumps ahead via URL is bounced back,
  and a completed user is never sent through onboarding again.
- A deterministic placement test (`src/lib/placement`) with a
  **CEFR-aligned, level-tagged question bank per target language** —
  English and French are authored today (one vocabulary + one grammar +
  one reading item per level, A1–C1), resolved server-side from the
  user's actual target language, never substituted with another
  language's content, and never sent to the client with its answer key.
  A target language with no authored bank shows an honest "not available
  yet" state and leaves the level `null` ("not assessed yet") rather
  than inventing one. Scoring (`scoring.ts`) is evidence-gated — a level
  is only credited after its own items are answered correctly, walked in
  order from A1, so easy items can never produce a high level. **C1 is
  the ceiling**: three multiple-choice items per level isn't enough
  evidence to responsibly award C2. Every real attempt records a
  server-owned `test_version` (e.g. `"en-v1"`). None of this is a
  validated linguistic evaluation — later phases can add writing, spoken
  assessment, and adaptive questions without changing this shape.
  Automated tests: `npm run test`.
- A deterministic personal-plan generator (`src/lib/plan`) — no AI calls.
- Fixed catalogs for goals (`src/constants/goals.ts`) and the 5 named AI
  teachers (`src/constants/teachers.ts`), exactly as specified.
- `src/constants/languages.ts` — HelloMova's real, finalized 50-language
  launch catalog (stable internal codes, not display names; the 5 Arabic
  dialects modeled as `variantOf: "ar"`; RTL flagged for Arabic, Persian,
  Hebrew).
- A visual pass on 5 of 7 onboarding screens (native language, target
  language, goal, placement test, level result) matching
  `design-references/onboarding/` — `src/styles/tokens.css`'s primary
  color, the option-row/card styling, and the progress bar were adjusted
  to match those screenshots. The placement test was also restructured to
  a one-question-at-a-time flow to match the reference (still the same
  deterministic, level-tagged vocabulary/grammar/reading bank underneath).
  Teacher and dashboard/home have **no reference screenshot yet** — they
  reuse the same tokens/components for a coherent look but aren't
  verified against a real mockup.

Not built yet, intentionally: AI lesson engine, voice/pronunciation,
Language Brain, spaced repetition, Business Course, career tools, billing,
push notifications, and the full 50-language content set.

## Security principles

- The browser is treated as untrusted; no client-side check is ever the
  authorization boundary.
- Every protected page/action re-verifies the session server-side via the
  DAL, independent of what any parent layout already checked.
- Supabase Row Level Security is mandatory on every table, scoped to
  `auth.uid()` — no broad public policies.
- The Supabase service-role key is never used in this codebase; if a
  future phase needs it, it must stay server-only and out of any
  `NEXT_PUBLIC_` variable.
- User-facing errors are always generic; real error detail is logged
  server-side only (`src/lib/utils/errors.ts`).
- Baseline security headers (CSP, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`,
  frame protection) are set in `next.config.ts` for every route.
- Redirect targets built from user input (e.g. post-login `redirectTo`)
  are validated with `getSafeRedirectPath` to prevent open redirects.
- Every onboarding mutation derives the user id from `verifySession()`
  inside `requireOnboardingStep()` — never from form data — and every
  enum-shaped input (language code, goal, teacher id, placement answers,
  CEFR level) is validated by Zod against the exact known set, with a
  matching Postgres CHECK constraint as a second, independent gate.
- No fabricated data: a learner who hasn't taken a real placement test
  has a `null` CEFR level ("not assessed yet"), never an invented one.

## Testing

```bash
npm run test
```

Runs the automated test suite (Vitest) for the placement scoring and
validation logic — evidence-gated leveling (`scoring.ts`), the C1 ceiling,
bank-scoped answer validation (`schemas.ts`), and "no authored bank means
no fabricated result" (`questions.ts`). These are deterministic unit
tests with no database or network dependency.

## Project structure

```
src/
  app/            App Router routes: (marketing), (auth), (dashboard), (onboarding)
  components/     Reusable UI (ui/) and layout/navigation primitives
  features/       Feature-scoped modules (auth, dashboard, onboarding)
  lib/            supabase/, auth/ (DAL), onboarding/ (DAL), placement/,
                  plan/, security/, utils/
  constants/      Shared route/language/goal/teacher catalogs
  types/          Hand-maintained Supabase types
  styles/         Design tokens
  proxy.ts        Optimistic session-refresh + redirect (not the security boundary)
supabase/
  migrations/     SQL schema + RLS policies (0001_init, 0002_onboarding,
                  0003_placement_category_breakdown,
                  0004_placement_test_version)
```
