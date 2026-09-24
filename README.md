# HelloMova

HelloMova is a premium AI language-learning platform. This repository is
currently at **Phase 4: Language Brain**, on top of Phase 1 (security/
auth/database foundation), Phase 2 (onboarding), and Phase 3 (the AI
lesson engine). Voice, pronunciation coaching/scoring, listening scoring,
an interactive Review Mode UI, Business/Career/Kids Language Brain,
Business Course, career tools, billing, and the full multilingual content
set are **not** built yet; they are future phases.

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
- [OpenAI](https://platform.openai.com) for the AI lesson engine, behind
  a small provider interface (`src/lib/ai/provider.ts`).

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
Level Security, not by keeping these secret.

- `OPENAI_API_KEY` — **server-only**, required for the AI lesson engine
  to actually generate lessons. If it's unset, the app does not fake a
  response: lesson start/continue will honestly fail with a
  configuration/service error until you set it. Never prefix this with
  `NEXT_PUBLIC_`.
- `OPENAI_MODEL` — optional, defaults to `gpt-4o-mini`.
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only, bypasses Row Level
  Security.** Required for the AI lesson engine's writes (see "AI lesson
  engine" below for why a service-role key is genuinely necessary there,
  not a convenience shortcut). From Supabase Project Settings → API →
  `service_role`. **Never** prefix this with `NEXT_PUBLIC_`, never send
  it to the browser, and never reuse it outside
  `src/lib/supabase/serviceRole.ts` without redoing the security review
  in `AGENTS.md`'s "AI lesson engine" section.

## Supabase setup (manual steps)

1. Create a Supabase project (or use an existing one).
2. Copy its Project URL and publishable key into `.env.local`.
3. Run the SQL in `supabase/migrations/0001_init.sql`, then
   `0002_onboarding.sql`, then `0003_placement_category_breakdown.sql`,
   then `0004_placement_test_version.sql`, then
   `0005_ai_lesson_engine.sql`, then `0006_language_brain.sql`, against
   your project **in that order** — either paste them into the Supabase
   SQL editor, or apply them with the Supabase CLI (`supabase db push`)
   if you use one. **This repository does not apply migrations for you**
   — `0005_ai_lesson_engine.sql` and `0006_language_brain.sql` in
   particular must be pasted into your own project's SQL editor before
   the lesson engine / Language Brain will work against it.
4. In Authentication settings, decide whether email confirmation is
   required for sign-up (the sign-up flow already handles both cases).
5. Set `OPENAI_API_KEY` (see "Environment variables" above) to actually
   generate lessons — without it, lesson start/continue fails honestly
   rather than faking a response. Set `SUPABASE_SERVICE_ROLE_KEY` too —
   the AI lesson engine's writes require it; see "AI lesson engine"
   below for why.

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
never accepted from the client. `0005_ai_lesson_engine.sql` creates
`lesson_sessions` and `lesson_messages` — readable via RLS scoped to
`auth.uid()`, but with **no insert/update grant at all** for
`authenticated`/`anon`: see "AI lesson engine" under "Current phase"
below for why an ordinary owner-scoped RLS policy isn't enough here, and
why writes instead require `SUPABASE_SERVICE_ROLE_KEY`. `0006_language_brain.sql`
adds the Language Brain's six tables (per-user + per-target-language
error/vocabulary/skill/review memory, plus an ingestion idempotency
ledger) with the same read-only-RLS / service-role-write pattern, and two
`service_role`-only SQL functions that atomically apply one lesson's
evidence or one review result — see "Language Brain" below.

## Current phase

**Phase 4 — Language Brain**, on top of Phase 3 (AI Lesson Engine),
Phase 2 (Onboarding), and Phase 1 (Foundation + Security + Auth +
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

Phase 3, new in this pass — the AI lesson engine. One mode: **General AI
Lesson**, text-only.

- Start a lesson from the dashboard (`StartLessonButton` →
  `startLessonAction`); it generates and validates the opening AI turn
  **before** writing anything to the database, so a failed AI call never
  leaves an orphaned session. Continue it at
  `/dashboard/lessons/[sessionId]` — a full chat-style view
  (`LiveLessonView`) with the teacher's correction callouts shown inline.
- All trusted lesson context (target/native language, CEFR level,
  learning goal, teacher persona) is **snapshotted onto the
  `lesson_sessions` row at creation** and re-read from that row on every
  later turn — never from a live profile re-read, and never from
  anything the client submits. A learner who hasn't taken a placement
  test (true for every target language except English/French right now)
  gets a lesson anyway: the model is told explicitly that the level is
  unassessed and to teach cautiously, rather than the app inventing a
  level.
- The AI provider (OpenAI, `src/lib/ai/`) sits behind a small interface.
  If `OPENAI_API_KEY` is unset, lessons fail with an honest configuration
  error — never a fabricated response. Every AI response is validated
  against a Zod schema (`src/lib/ai/lessonResponseSchema.ts`) before
  anything is persisted; malformed output is rejected outright.
- **Writes are `service_role`-only, deliberately.** A browser's Supabase
  session and a Server Action's server client share the same
  publishable-key credential, so an `auth.uid() = user_id` RLS policy
  alone would let an authenticated browser insert a fabricated
  `role = 'teacher'` message, mark its own lesson `'completed'`, or
  rewrite its snapshot fields directly — none of that is
  cross-tenant, so tenant-scoped RLS wouldn't catch it. `authenticated`/
  `anon` get no insert/update grant on `lesson_sessions`/`lesson_messages`
  at all; every write goes through a `service_role` client
  (`src/lib/supabase/serviceRole.ts`) used only inside
  `src/features/lessons/actions.ts`, which derives `user_id` from a
  server-verified session, never from client input. Two triggers back
  this up structurally even against that trusted code: session snapshot
  fields are immutable after creation and status may only move
  `active → completed`/`active → abandoned`; messages can never be
  updated or deleted once written, by anyone.
- Real, DB-backed rate limiting (`src/lib/lessons/rateLimit.ts`, no new
  infra) and client-UUID + DB-unique-constraint idempotency for message
  sends (safe to retry after a network hiccup or AI failure without
  duplicating your message or losing it).
- A one-off, session-local summary is generated when a lesson completes —
  it explicitly does not claim anything about other sessions, streaks, or
  history at generation time; the Language Brain (below) is what turns
  that evidence into cross-session memory afterward.
- Automated tests: `src/lib/lessons/*.test.ts`, `src/lib/ai/*.test.ts`,
  `src/features/lessons/actions.test.ts` — run with `npm run test`.

Phase 4, new in this pass — the **Language Brain**: durable, cross-session
learning memory, owned by `(user_id, target_language_code)` — never by
teacher, so switching teachers never resets or forks it.

- **Ingestion**: when a lesson completes, `ensureLessonIngested`
  (`src/lib/languageBrain/ingest.ts`) reads that lesson's already-real,
  already-persisted evidence (per-turn corrections, the session's
  vocabulary list) and turns it into durable memory — recurring error
  patterns (a category + normalized pattern key, AI-classified with a
  deterministic fallback if the AI is unavailable or its output doesn't
  validate), vocabulary encounters, and a grammar skill score. Idempotent
  by construction: a `language_brain_ingestions` row with a unique
  `lesson_session_id` tracks status, and a single atomic Postgres function
  applies all of one lesson's evidence or none of it — a retry after a
  failure can't double-count. Ingestion runs synchronously after
  completion and again, lazily, from the Language Brain view for any
  recent completed lesson still missing a successful ingestion — a
  self-healing retry with no cron/queue infrastructure. A failure here
  never undoes the lesson's own completion.
- **Recurring vs. one-off**: a mistake only counts as "recurring" after
  it's been seen in **2 distinct lessons** (a generated database column,
  not just application logic, so the threshold can't be silently
  bypassed). One typo in one lesson is never shown as a weakness.
- **Grammar score, explainable and concurrency-safe**: a real cumulative
  percentage — the share of learner turns with no grammar-family
  correction — computed by Postgres itself as a generated column from two
  raw counters (positive/total), which each lesson's ingestion atomically
  *adds to* rather than overwrites. That's what lets two lessons finish
  ingesting at the same time without one silently erasing the other's
  contribution, and it means no rounding error can build up over months
  of lessons the way re-averaging an already-rounded percentage would.
  Vocabulary, reading, writing, speaking, listening, and pronunciation are
  **never** given a fabricated score in this phase: vocabulary is shown
  as real counts instead, and the rest show "Not assessed yet" because a
  text-only lesson has no real evidence for them.
- **Spaced repetition**: a fixed 1 day → 3 days → 1 week → 30 days review
  schedule per vocabulary item. A failed review resets to day 1; a
  successful one advances, and passing the final stage is what marks a
  word "mastered" — never just appearing once. The server-side model for
  recording a review result is real and tested
  (`recordReviewResultAction`), though the interactive flashcard-style
  Review Mode screen itself isn't built yet — the Language Brain view
  shows real due counts/items only.
- **Personalization, bounded**: new lessons get a small, capped summary
  of the learner's top recurring grammar patterns, due vocabulary, and
  weak areas woven into roughly 20–30% of the lesson — never the whole
  thing, and never more than a fixed few items regardless of how much
  history exists, so the prompt never grows unbounded.
- **Security**: writes go through the same `service_role`-only pattern as
  the lesson engine, for the same reason — a browser's Supabase session
  can't be told apart from a trusted server call by `auth.uid()` alone,
  and this is derived learning state a user must never be able to fake
  (mastery, scores, recurring-mistake counts, review dates). See
  `AGENTS.md`'s "Language Brain" section for the full model.
- Automated tests: `src/lib/languageBrain/*.test.ts`,
  `src/features/languageBrain/actions.test.ts`, plus lesson-engine tests
  extended for the personalization hook and ingestion trigger — run with
  `npm run test`.

Not built yet, intentionally: real pronunciation/listening scoring or
memory, an interactive Review Mode UI, Business/Career/Kids Language
Brain, Business Course, career tools, billing, push notifications, and
the full 50-language content set.

## Security principles

- The browser is treated as untrusted; no client-side check is ever the
  authorization boundary.
- Every protected page/action re-verifies the session server-side via the
  DAL, independent of what any parent layout already checked.
- Supabase Row Level Security is mandatory on every table, scoped to
  `auth.uid()` — no broad public policies.
- The Supabase service-role key is used in exactly two places — the AI
  lesson engine's writes and the Language Brain's writes
  (`src/lib/supabase/serviceRole.ts`) — because `auth.uid()`-scoped RLS
  cannot distinguish "our server generated this" from "the browser wrote
  this with its own session"; it stays server-only, out of any
  `NEXT_PUBLIC_` variable, and out of every other feature.
- The Language Brain never lets the browser set a skill score, a
  recurring-mistake count, a mastery flag, or a review date directly —
  every one of those is computed server-side from real, already-persisted
  lesson evidence, atomically applied, and idempotent (the same completed
  lesson can't be ingested twice).
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
- The AI lesson engine never trusts the client for anything that decides
  lesson content or state: `sendLessonMessageAction` builds its context
  solely from the session's own DB row, and the learner's message text is
  treated as untrusted lesson content, never as instructions, both in the
  system prompt and — the actual guarantee — in code, since no client
  field can reach a trusted field regardless of what the model does with
  a prompt-injection attempt. The OpenAI key never reaches the browser or
  a log line; an unconfigured/failed provider surfaces an honest error,
  never a fabricated lesson response.

## Testing

```bash
npm run test
```

Runs the automated test suite (Vitest) for:

- Placement scoring and validation logic — evidence-gated leveling
  (`scoring.ts`), the C1 ceiling, bank-scoped answer validation
  (`schemas.ts`), and "no authored bank means no fabricated result"
  (`questions.ts`).
- The AI lesson engine — learner-message validation and summary-schema
  validation (`src/lib/lessons/schemas.test.ts`), malformed
  structured-AI-output rejection (`src/lib/ai/lessonResponseSchema.test.ts`),
  prompt construction (correct target language, no fabricated CEFR,
  security instructions always present, bounded context window, and the
  Language Brain personalization section only appears with real evidence
  and stays within its reinforcement bound;
  `src/lib/lessons/prompt.test.ts`), and `sendLessonMessageAction`'s real
  control flow — ownership/ended-session checks, that the AI call's
  context always reflects the session's trusted snapshot even when the
  client submits spoofed target-language/CEFR/teacher fields, that
  personalization is built from the session's own user id/target
  language, and that lesson completion triggers Language Brain ingestion
  (`src/features/lessons/actions.test.ts`).
- The Language Brain — the grammar-score formula and the arithmetic
  property that makes concurrent per-lesson contributions additive rather
  than overwriting (`src/lib/languageBrain/scoring.test.ts`),
  the fixed 1d/3d/7d/30d spaced-repetition schedule and failure-reset rule
  (`spacedRepetition.test.ts`), AI-classification fallback on malformed or
  incomplete output (`errorClassification.test.ts`), ingestion's
  idempotency short-circuit, per-lesson pattern dedup, grammar-evidence
  derivation, vocabulary normalization, and failure/retry behavior
  (`ingest.test.ts`), weak-area ranking and the self-healing retry sweep
  (`dal.test.ts`), the bounded/scoped personalization context builder
  (`personalization.test.ts`), and `recordReviewResultAction`'s
  ownership check plus server-computed (never client-trusted)
  stage/mastery values (`src/features/languageBrain/actions.test.ts`).

These are deterministic unit/mock-boundary tests with no live database or
network dependency — the AI provider is mocked only at its boundary
(`src/lib/ai/provider.ts`), not the business rules being tested. One case
from the Phase 3 brief (idempotent duplicate submission) and the Phase 4
cross-lesson recurrence count/RLS/grant/trigger guarantees are
intentionally not covered by a test — see the comments in `actions.test.ts`
and `ingest.test.ts` for why — and are instead DB unique
constraints/generated columns (`0005_ai_lesson_engine.sql`,
`0006_language_brain.sql`) plus code-reviewed logic, verified manually
against a live Supabase project.

## Project structure

```
src/
  app/            App Router routes: (marketing), (auth), (dashboard), (onboarding)
                  (dashboard)/dashboard/lessons/[sessionId] — live lesson UI
                  (dashboard)/dashboard/language-brain — Language Brain view
  components/     Reusable UI (ui/) and layout/navigation primitives
  features/       Feature-scoped modules (auth, dashboard, onboarding,
                  lessons, languageBrain)
  lib/            supabase/ (per-request client, browser client,
                  service-role client for lesson + Language Brain writes
                  only), auth/ (DAL), onboarding/ (DAL), placement/,
                  plan/, security/, utils/, ai/ (provider + structured
                  output schema), lessons/ (DAL, prompt builder, rate
                  limiting, AI orchestration), languageBrain/ (DAL,
                  ingestion pipeline, AI classification, deterministic
                  scoring + spaced-repetition math, bounded
                  personalization context builder)
  constants/      Shared route/language/goal/teacher catalogs
  types/          Hand-maintained Supabase types
  styles/         Design tokens
  proxy.ts        Optimistic session-refresh + redirect (not the security boundary)
supabase/
  migrations/     SQL schema + RLS policies (0001_init, 0002_onboarding,
                  0003_placement_category_breakdown,
                  0004_placement_test_version, 0005_ai_lesson_engine,
                  0006_language_brain)
test/
  server-only-stub.ts  Vitest alias target for the "server-only" package
                       (see vitest.config.mts) — see AGENTS.md for why
```
