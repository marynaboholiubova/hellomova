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
Lesson, text-only); Phase 4 added the Language Brain (durable, per-user
+ per-target-language cross-session learning memory derived from
completed lessons). Do not implement future phases (voice, pronunciation
scoring/memory, listening scoring, an interactive Review Mode UI,
Business/Career/Kids Language Brain, Business Course, career tools,
billing, multilingual content) without explicit instruction.

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
learner). A session's `summary` (`lesson_sessions.summary`) covers only
that one session and says so in its own generation prompt — cross-session
memory is the Language Brain (below), a separate system layered on top,
not part of this section.

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

### Language Brain (Phase 4)

Durable, cross-session learning memory, owned by **(`user_id`,
`target_language_code`) — never `teacher_id`.** Switching teachers
(Anna → James → Sofia → Alex → Mary) never resets or forks this data;
teacher personality is presentation only. A learner studying two target
languages gets two fully isolated memories — every query filters by both
`user_id` and `target_language_code`.

- **Data model** (`supabase/migrations/0006_language_brain.sql`, all
  additive, RLS-select-only for `authenticated`):
  `language_brain_profiles` (one row per user+language, evidence-volume
  anchor), `language_brain_skill_states` (normalized per-skill score —
  Phase 4 only ever writes `'grammar'`; see below), `language_brain_error_patterns`
  (one row per normalized `pattern_key`, `occurrence_count` +
  `is_recurring` — a **generated column**, `occurrence_count >= 2`, so the
  recurring threshold can't be spoofed by a write path that forgets to
  set it), `language_brain_vocabulary` (one row per normalized
  `canonical_form`), `language_brain_review_items` (the durable spaced-
  repetition queue — one row per source item, updated in place, not a
  log), and `language_brain_ingestions` (the idempotency ledger — `unique
  (lesson_session_id)` is the actual guarantee a lesson is never ingested
  twice).
- **Writes require `service_role`, same threat model as Phase 3 — read
  0005's header comment, then 0006's.** Every Language Brain row is
  entirely server-derived from trusted lesson evidence; the browser must
  never be able to say "I made this error," "my grammar score is 90," or
  "mark this word mastered." `authenticated`/`anon` get an explicit
  `revoke` (not just "no policy") on insert/update/delete for every table
  here. All writes go through exactly two SQL functions, granted execute
  **only** to `service_role` (never `authenticated`, never as an exposed
  `security definer` RPC — that would reopen the identical hole 0005
  warns about):
  - `language_brain_ingest_lesson()` — called from
    `src/lib/languageBrain/ingest.ts`. Runs as one Postgres transaction:
    upserts error patterns/vocabulary, atomically ADDS this lesson's raw
    grammar evidence to the cumulative counters (see "Grammar skill
    score" below — **not** a precomputed final score), bumps the
    profile, and marks the ingestion row `'completed'`, or none of that
    happens at all.
  - `language_brain_record_review_result()` — called from
    `src/features/languageBrain/actions.ts`
    (`recordReviewResultAction`). Takes an **optimistic-concurrency**
    `p_expected_current_stage`; if the row's stage no longer matches
    (already advanced by a concurrent request), it refuses rather than
    overwriting with stale data.
  - The review-result function takes its new/final values (stage, due
    date, mastery) as pre-computed parameters from trusted, unit-tested
    application code (`src/lib/languageBrain/spacedRepetition.ts`) — that
    function persists, it doesn't decide; optimistic concurrency (above)
    is what keeps that safe under a race. The ingest function is
    different and deliberately does **not** take a precomputed final
    score — see "Grammar skill score" below for why, and for the
    concurrency bug an earlier version of this function had and no
    longer has.
- **Reads stay on the ordinary per-request RLS client**
  (`src/lib/languageBrain/dal.ts`, `personalization.ts`) — `auth.uid()`
  scoping is a real backstop here, not decoration, same as Phase 3.
- **Ingestion pipeline** (`src/lib/languageBrain/ingest.ts`,
  `ensureLessonIngested(sessionId)`): reads the completed
  `lesson_session` + its `lesson_messages` (already-real, already-
  persisted evidence — per-turn `metadata.correction` and the session
  `summary.vocabulary` list), sends only the real observed corrections to
  a bounded AI **classification** call (category + normalized
  `patternKey` — never invents a correction that didn't happen), dedupes
  by `patternKey` **within this one lesson** (repeating a mistake 5× in
  one lesson counts as at most 1 occurrence — recurring means recurring
  *across lessons*, not noise within one), computes THIS LESSON's own
  raw grammar-evidence counts (never a cumulative final score — see
  "Grammar skill score" below), and calls the ingest RPC. Called
  synchronously right after
  `sendLessonMessageAction` marks a session `'completed'`, and again
  lazily from `getLanguageBrainSummary()` for any of the caller's recent
  completed sessions lacking a `'completed'` ingestion row — a
  self-healing retry with no cron/queue infrastructure. Never throws: a
  failure marks the ingestion row `'failed'` (retryable) and does not
  affect the lesson, which already completed successfully.
- **AI classification, not AI decision-making**
  (`src/lib/languageBrain/errorClassification.ts`): the AI may categorize
  an already-real correction (grammar/article/tense/…) and suggest a
  grouping key; it never originates a correction, never decides
  recurrence, never computes a score. A response that fails Zod
  validation or doesn't cover exactly the input indices is rejected
  **as a whole batch**, falling back to a deterministic classification
  (`category: "other"`, a slugified pattern key) — ingestion never blocks
  on the AI provider being unavailable.
- **Recurring-error threshold: 2 distinct lessons**
  (`RECURRING_ERROR_THRESHOLD` in `src/lib/languageBrain/constants.ts`,
  mirrored by the `is_recurring` generated column). A single correction
  is never shown as a weakness.
- **Grammar skill score, concurrency-safe by construction**
  (`0006_language_brain.sql`'s `language_brain_skill_states` table): a
  genuine, explainable cumulative percentage — *"% of learner turns with
  no grammar-family correction"* — computed as a **Postgres generated
  column** (`score = round(100.0 * positive_evidence_count /
  evidence_count)`) from two raw integer counters. `ingest.ts` sends only
  THIS LESSON's own raw counts (`p_grammar_total_turns`,
  `p_grammar_positive_turns`); `language_brain_ingest_lesson()` ADDS them
  to the stored counters via `INSERT ... ON CONFLICT DO UPDATE SET x = x
  + excluded.x` (Postgres's standard atomic-increment pattern, which
  takes the row lock it needs as part of conflict resolution). **An
  earlier version of this design had application code read the prior
  score, compute a new final cumulative score in TypeScript, and pass
  that final value in for the RPC to simply persist — two concurrent
  ingestions for the same `(user, target_language_code)` could both read
  the same stale prior state and the second write would silently
  overwrite the first lesson's contribution. That version is gone.**
  There is now exactly one place this percentage is ever computed (the
  generated column), so it cannot drift from the counters, and because
  the raw integers are summed exactly before the single rounding step
  ever runs, repeated accumulation cannot compound rounding error the way
  re-averaging an already-rounded percentage would.
  `src/lib/languageBrain/scoring.ts`'s `deriveGrammarScore` mirrors this
  same formula and is unit-tested (`scoring.test.ts`), but is **not**
  used by any write path — it exists purely so the formula is documented
  and tested outside of a live Postgres instance; if the generated
  column's SQL expression ever changes, mirror the change there too.
  **Vocabulary, reading, writing, speaking, listening, and pronunciation
  never get a score in Phase 4** — vocabulary is represented by real
  counts (encountered/reviewing/mastered) instead of an invented
  percentage; the rest have no real evidence source yet from a text-only
  lesson and must show "Not assessed yet," never a fabricated or zero
  value, never silently omitted.
- **Vocabulary memory**: normalized by `normalizeVocabularyCanonicalForm`
  (lowercase/trim/collapse-whitespace — not lemmatization; a known,
  documented limitation, not linguistic tooling). Sourced from
  `lesson_sessions.summary.vocabulary` (already real per-lesson evidence)
  — translation/example enrichment is a future extension, not fabricated
  here. A word is `mastered` (`mastery_score = 100`) only after passing a
  review at the final spaced-repetition stage — never after merely
  appearing once.
- **Spaced repetition** (`src/lib/languageBrain/spacedRepetition.ts`,
  `computeNextReview`): fixed schedule, stage 1→2→3→4 = due
  +1d/+3d/+7d/+30d on a successful ("good") review; stage 4 stays at
  stage 4 (steady-state +30d) and keeps mastery. A failed ("again")
  review **always resets to stage 1 / +1 day and clears mastery**,
  regardless of the prior stage — simplest real rule, not SM-2. The
  result model is the smallest real one for the current scope: pass/fail
  (`'again' | 'good'`), since no interactive Review Mode UI exists yet.
- **Review server-side foundation without a Review Mode UI**:
  `recordReviewResultAction` (`src/features/languageBrain/actions.ts`) is
  fully real, ownership-checked, and tested — it's just not wired to an
  interactive flashcard screen yet, because that screen doesn't exist
  (building a fake one would violate "don't create UI that pretends
  behavior exists"). The dashboard/Language Brain view shows real due
  counts/items only.
- **Weak-area ranking** (`src/lib/languageBrain/dal.ts`,
  `rankWeakAreas`): recurring first, then by occurrence count, then by
  recency — a single one-off mistake can never outrank a genuinely
  recurring pattern.
- **Personalization hook, bounded** (`src/lib/languageBrain/personalization.ts`,
  `buildLessonPersonalizationContext`): capped arrays (top 3 recurring
  grammar patterns, 5 due vocabulary terms, 3 weak areas, 2 strengths —
  `MAX_PERSONALIZATION_*` in `constants.ts`) woven into
  `buildLessonSystemPrompt` (`src/lib/lessons/prompt.ts`) as a
  reinforcement instruction: roughly 20–30% of the lesson, never the
  whole thing, and the model is told not to invent history beyond what's
  listed. Always built from the session's own trusted snapshot
  (`user_id`/`target_language_code`) inside
  `src/features/lessons/actions.ts`, the same trust boundary as every
  other lesson-context field — never from client input, never from a
  live profile re-read.
- **Failure/retry**: ingestion failure never corrupts lesson completion
  (already committed by the time ingestion runs) and is always retryable
  via the self-healing sweep above — see "Ingestion pipeline."
- **Extraction versioning**: `EXTRACTION_VERSION` in
  `src/lib/languageBrain/constants.ts` (currently `"brain-v1"`), recorded
  on every `language_brain_ingestions` row, same pattern as the lesson
  engine's `prompt_version` and the placement test's `test_version`. No
  reprocessing pipeline is built yet (out of scope for this phase); a
  future version bump does not retroactively reinterpret old rows.
- **Automated tests**: `src/lib/languageBrain/*.test.ts`,
  `src/features/languageBrain/actions.test.ts`, plus lesson-engine tests
  extended for the personalization hook
  (`src/lib/lessons/prompt.test.ts`) and ingestion trigger
  (`src/features/lessons/actions.test.ts`) — run with `npm run test`.
  Deterministic logic (the grammar-score formula and its rounding/order-
  independence properties in `scoring.test.ts`, spaced repetition,
  weak-area ranking, AI-classification fallback, ingestion orchestration
  — including that only THIS LESSON's raw grammar counts are ever sent,
  never a prior-state read — and the review-result trust boundary) is
  exercised directly. **What Vitest cannot prove**: that
  `INSERT ... ON CONFLICT DO UPDATE`'s row-locking genuinely serializes
  two truly concurrent ingestions for the same
  `(user, target_language_code)` on live Postgres — that requires a real
  database. See `0006_language_brain.sql`'s manual verification steps
  (also in the Phase 4 delivery report) for the exact concurrent-ingestion
  procedure to run once this migration is applied. RLS/grant/trigger
  guarantees on the new tables are likewise not provable by Vitest and are
  code-reviewed against the migration instead.

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
  Component, or via a `NEXT_PUBLIC_` variable. The AI lesson engine and
  the Language Brain are the only places this codebase uses it
  (`SUPABASE_SERVICE_ROLE_KEY` via `src/lib/supabase/serviceRole.ts`),
  because `lesson_sessions`/`lesson_messages` and every `language_brain_*`
  table need writes no `auth.uid()`-scoped RLS policy could make
  trustworthy — see the "AI lesson engine" and "Language Brain" sections
  above before reusing this client anywhere else or granting
  `authenticated` write access to any of these tables.
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
