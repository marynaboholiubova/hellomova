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
dashboard); Phase 3 added the real AI lesson engine (one mode — General AI
Lesson, text-only). Do not implement future phases (voice, pronunciation
scoring, Language Brain / cross-session memory, Business Course, career
tools, billing, multilingual content) without explicit instruction.

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

### AI lesson engine (Phase 3)

One mode exists: **General AI Lesson**, text-only (no voice/pronunciation
scoring — Mary's persona explicitly disclaims ever having "heard" the
learner). This is deliberately **not** Phase 4's Language Brain: nothing
here remembers or reasons across sessions. A session's `summary` (session
`lesson_sessions.summary`) covers only that one session and says so in its
own generation prompt.

- **Data model** (`supabase/migrations/0005_ai_lesson_engine.sql`):
  `lesson_sessions` snapshots its context (target/native language, CEFR,
  goal, teacher, `prompt_version`) **at creation time** — a lesson stays
  internally consistent even if the learner's live profile changes while
  it's open. `lesson_messages` denormalizes `user_id` for simple RLS and
  has **no `'system'` role** — the system prompt is rebuilt fresh
  server-side on every AI call and is never persisted as a row, so it
  cannot leak through a message-listing query. Neither table has a delete
  policy. `lesson_messages` has a unique index on
  `(lesson_session_id, client_turn_id)` for learner-message idempotency.
- **Writes to both tables require `service_role` — this is deliberate,
  read the migration's header comment before changing it.** A browser's
  Supabase session and a Server Action's server-side client authenticate
  with the *same* publishable-key credential (compare
  `src/lib/supabase/client.ts` and `server.ts`) — Postgres cannot tell
  them apart. An `auth.uid() = user_id` RLS policy only enforces tenant
  isolation, not trust; it would let an authenticated browser insert a
  `lesson_messages` row with `role = 'teacher'`, mark its own session
  `'completed'`, overwrite `summary`, or rewrite its own snapshot fields
  after creation, all indistinguishable from real server-generated data.
  So `authenticated`/`anon` have **no insert/update grant at all** on
  either table (an explicit `revoke`, not just "no policy" — see the
  migration). All writes go through `createServiceRoleClient()`
  (`src/lib/supabase/serviceRole.ts`), used only inside
  `src/features/lessons/actions.ts`, which derives every `user_id` from a
  server-verified session — never from client input — since that
  application check is now the only thing standing in for the write-side
  RLS check these tables intentionally don't have. Two triggers add a
  structural backstop that holds even against this trusted code:
  `lesson_sessions_protect_snapshot_trigger` rejects any update to a
  snapshot column and any status transition other than
  `active → completed`/`active → abandoned`; `lesson_messages_prevent_update`/
  `_prevent_delete` reject *every* update/delete unconditionally — both
  tables' triggers fire regardless of `service_role`'s RLS bypass, so
  they protect against a future bug in the trusted code too, not just
  against the browser. Never add an insert/update policy for
  `authenticated` to either table without redoing this whole analysis —
  a SECURITY DEFINER RPC exposed to `authenticated` would reopen the
  identical hole, since it only changes who can perform the write, not
  who can call the function with fabricated arguments.
- **Reads stay on the ordinary per-request client** (`src/lib/supabase/
  server.ts`), RLS-scoped to `auth.uid() = user_id` as usual — only
  writes needed to move to `service_role`, so read-side RLS is still a
  real backstop against an ownership-check bug in the DAL.
- **Trusted context is server-owned, always.** `sendLessonMessageAction`
  (`src/features/lessons/actions.ts`) builds the `LessonContext` sent to
  the model **entirely from the session's own DB row** — never from a
  fresh profile read, and never from `formData`. The action does not even
  read a `teacherId`/`cefrLevel`/`targetLanguageCode` field from the
  client's submission; there is no code path for the client to influence
  which teacher, language, or level a turn uses. If you touch this
  function, keep it that way — a prior version of this action leaked one
  field (`learningGoalLabel`) from a live profile read instead of the
  session snapshot; that class of bug is exactly what
  `src/features/lessons/actions.test.ts` (cases C/D/E) exists to catch.
- **CEFR unassessed ≠ fabricated.** `lesson_sessions.cefr_level` stays
  `null` for the 48 target languages with no placement bank yet
  (`src/lib/lessons/prompt.ts`'s `UNASSESSED_GUIDANCE`) — the model is
  told explicitly not to assume or state a level, and to start
  beginner-safe. Never invent an A1 here, same rule as Phase 2.1.
- **AI provider boundary** (`src/lib/ai/provider.ts` /
  `openaiProvider.ts`): OpenAI, behind a small `AiProvider` interface so a
  future provider swap doesn't touch calling code. `OPENAI_API_KEY` is
  server-only, never logged, never sent to the client. If it's unset, the
  provider throws a typed `AiProviderError("not_configured")` and the UI
  shows an honest config/service error — **never** a fabricated lesson
  response. Structured output is validated with
  `src/lib/ai/lessonResponseSchema.ts` before anything is persisted;
  malformed output is rejected outright.
- **Prompt injection**: defense in depth. The system prompt
  (`buildLessonSystemPrompt`) explicitly tells the model the learner's
  text is untrusted content, never instructions, and to never reveal the
  system prompt or claim to change account state — but the real guarantee
  is code-level: learner text is never read into any trusted field (see
  above), so there's nothing for a prompt-injection attempt to actually
  change even if the model ignored the instructions.
- **Rate limiting** (`src/lib/lessons/rateLimit.ts`) is a real, DB-backed
  `count(*)` query against `lesson_sessions`/`lesson_messages` — no new
  infra, no in-memory state that would fail across server instances. Max
  5 new lessons/hour, 20 messages/5 minutes per user; fails closed (denies)
  on a query error.
- **Idempotency**: the client mints a `clientTurnId` (UUID) per send
  attempt; the DB unique constraint above is the actual guarantee. On a
  `23505` unique-violation, `findReplyForClientTurn` replays the existing
  teacher reply if one exists, or falls through to generate one for the
  already-stored learner message if the prior attempt never got a reply
  (e.g. the AI call failed) — no duplicate learner turn either way.
- **Automated tests**: `src/lib/lessons/*.test.ts`, `src/lib/ai/*.test.ts`,
  `src/features/lessons/actions.test.ts` — run with `npm run test`. The
  duplicate-submission guarantee (case M) is deliberately *not* simulated
  there (it would just assert a mock does what it's told); it's
  code-reviewed against the real unique constraint instead.
- Vitest needs a `"server-only"` alias (`test/server-only-stub.ts`,
  wired in `vitest.config.mts`) because `server-only`'s real package
  throws unconditionally outside of Next.js's bundler-level aliasing —
  every module in `src/lib/lessons` and `src/lib/ai` imports it. If a new
  test file importing server-only code fails with "This module cannot be
  imported from a Client Component module," this alias is why it exists —
  don't remove it.

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
  Component, or via a `NEXT_PUBLIC_` variable. The AI lesson engine is
  the one place this codebase uses it (`SUPABASE_SERVICE_ROLE_KEY` via
  `src/lib/supabase/serviceRole.ts`), because `lesson_sessions`/
  `lesson_messages` need writes no `auth.uid()`-scoped RLS policy could
  make trustworthy — see the "AI lesson engine" section above before
  reusing this client anywhere else or granting `authenticated` write
  access to either table.
- Never leak raw database or auth provider errors to users — return
  generic, safe messages (see `src/lib/utils/errors.ts`) and log details
  server-side only.
- Post-login redirect targets (or any other redirect built from
  user-controlled input) must go through `getSafeRedirectPath`
  (`src/lib/utils/redirects.ts`) — never `redirect()` a raw query param or
  form value directly. It only allows same-origin relative paths.
- Rate limiting for auth and audit logging are not implemented yet. The
  intended attachment points are marked with `// Extension point:`
  comments next to the Supabase Auth calls in
  `src/features/auth/actions.ts` — wire a real limiter/logger in there
  rather than scattering ad hoc checks. (The AI lesson engine *does* have
  real, DB-backed rate limiting — see `src/lib/lessons/rateLimit.ts` — it
  was only auth that was still open.)
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
