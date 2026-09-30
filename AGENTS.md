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
completed lessons); Phase 5 added CEFR Assessment v2 (durable,
policy-gated confirmed-vs-learning-level architecture, item versioning,
and skill-specific evidence — see below). Do not implement future phases
(voice, pronunciation scoring/memory, listening scoring, an interactive
Review Mode UI, an interactive CEFR Assessment-taking UI beyond the
read-only status view, Business/Career/Kids Language Brain, Business
Course, career tools, billing, multilingual content) without explicit
instruction.

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

### CEFR Assessment v2 (Phase 5)

**Confirmed level ≠ learning level.** A learner may already be studying
B2 material while their formally confirmed HelloMova assessment level is
still B1. `user_languages` now has three level-ish columns, each with a
distinct, non-interchangeable meaning:
- `current_cefr_level` — **unchanged historical meaning**: placement v1's
  estimated result. Never removed, never redefined.
- `learning_cefr_level` — the current study-reference level (backfilled
  from `current_cefr_level` at migration time; going forward maintained
  by the personal-plan/lesson surfaces, not by this phase or by Language
  Brain).
- `confirmed_cefr_level` — **only ever set by a real, policy-gated
  `level_confirmation` assessment outcome.** Backfilled to `NULL` for
  every existing user, including ones with a v1 estimate — a v1 estimate
  is explicitly not a confirmed multi-skill result (see
  `src/app/(onboarding)/onboarding/result/page.tsx`, which already says
  so in its own copy). Since no confirmation policy is active (see
  below), this column is `NULL` for every user today, old or new, and
  will stay that way until a human activates one.
- `assessment_status` (`unassessed` | `estimated` | `confirmed`) — a
  quick per-language summary, backfilled from whether `current_cefr_level`
  was set.

**`confirmed_cefr_level`/`learning_cefr_level`/`assessment_status` are
locked against `authenticated`/`anon` at the PRIVILEGE level, not just
governed by convention — and this required removing a table-level grant,
not just adding a column-level revoke.** `user_languages` predates this
migration; 0001_init.sql through 0006_language_brain.sql never issue a
single `grant`/`revoke` against it, so `authenticated`/`anon` hold
Supabase's default **table-level** INSERT/UPDATE/DELETE/SELECT on it, on
top of 0001_init.sql's row-owner-scoped RLS policies (`auth.uid() =
user_id`). RLS cannot narrow this to specific columns — it governs which
ROWS a statement may touch, not which COLUMNS within an allowed row it
may set.

An earlier draft of this migration tried to close the gap with a
column-level-only `revoke insert (col...), update (col...) ...
from authenticated, anon` on just the three trusted columns, leaving the
existing table-level grant untouched. **That is a no-op and does not
work**: Postgres computes column-write eligibility as the UNION of
table-level and column-level privilege, so a role holding the
table-level INSERT/UPDATE grant can still write any column regardless of
what a column-level revoke says — the table-level grant alone remains
sufficient on its own. The actual fix has to narrow FROM a table-level
grant: `revoke insert, update on user_languages from authenticated, anon`
(removing the broad grant entirely — SELECT/DELETE untouched), followed
by re-granting column-level INSERT on exactly `(user_id,
target_language_code, is_primary)` and column-level UPDATE on exactly
`(user_id, target_language_code, is_primary, current_cefr_level)` to
`authenticated` — the real, exact column set
`src/features/onboarding/actions.ts`'s two write paths use (verified
against the live source and locked in by
`src/features/onboarding/actions.test.ts`), including `user_id`/
`target_language_code` in the UPDATE grant because PostgREST's generated
`ON CONFLICT (...) DO UPDATE SET` for the onboarding upsert assigns every
inserted column to `excluded.<column>`, conflict-key columns included.
`confirmed_cefr_level`/`learning_cefr_level`/`assessment_status` are
absent from every grant, and with the table-level grant gone there is no
other way for `authenticated`/`anon` to reach them — only `service_role`
(which bypasses privilege checks the same way it bypasses RLS) can write
them, and only via this migration's own SQL functions.
`0007_cefr_assessment_v2.sql` includes a read-only
`has_table_privilege`/`has_column_privilege` verification query
immediately after these grants — the actual, checkable proof of this,
not just a description of the grant statements.

**Language Brain predicts readiness. Assessment confirms level. Language
Brain can never promote a confirmed level, structurally, not by
convention.** No function in `0007_cefr_assessment_v2.sql` ever writes a
non-null `confirmed_cefr_level` or `cefr_skill_states.confirmed_level` —
doing so honestly requires an ACTIVE row in `assessment_policy_versions`
for `level_confirmation`, and this migration inserts none. Completing
lessons can never, by itself, convert a confirmed B1 into a confirmed B2.

- **Data model** (`supabase/migrations/0007_cefr_assessment_v2.sql`):
  `assessment_policy_versions` (the policy registry — see below),
  `writing_rubric_versions` (a fixed, versioned writing rubric),
  `assessment_items` (stable question identity: language/skill/CEFR
  target) + `assessment_item_versions` (the actual versioned
  prompt/options/answer-key/rubric-binding — a content revision creates a
  NEW version, never edits history), `language_assessments` (one row per
  attempt), `assessment_responses` (one placeholder row per served item,
  mutable only while the parent assessment is `in_progress`, then
  structurally immutable forever — even against `service_role`),
  `writing_evaluations` (AI-produced, rubric-bound, Zod-validated
  criterion evidence), `assessment_skill_results` (one row per
  attempt+skill, immutable), `cefr_skill_states` (the learner's
  cumulative per-skill profile — "Skill Profile"), `level_readiness_states`
  (Language-Brain-derived readiness EVIDENCE, never a verdict),
  `bridge_plans` + `bridge_plan_targets` (targeted remediation linked to
  real Language Brain/assessment gaps, never a generic "study more").
- **Skill model, no CHECK constraint on `skill`** — matches
  `lesson_sessions.mode`'s precedent: the six primary domains (grammar,
  vocabulary, reading, listening, writing, speaking) plus pronunciation
  are the live set in `src/lib/assessment/constants.ts`'s Zod enum,
  chosen so future CEFR-aligned domains (spoken/written interaction,
  mediation, sociolinguistic/pragmatic competence) never need a
  migration. `ASSESSABLE_SKILLS_TODAY` (grammar, vocabulary, reading,
  writing) is the actually-assessable-from-text subset — listening,
  speaking, and pronunciation are schema-supported but **no code path in
  this phase ever produces evidence for them.**
- **Item versioning is mandatory and enforced structurally.**
  `assessment_responses.item_version_id` is fixed the instant a response
  placeholder is created, before an answer even exists — a later content
  revision (new `assessment_item_versions` row, old one retired) can
  never retroactively change what a historical response was scored
  against. `assessment_items`/`assessment_item_versions` have **no select
  policy for `authenticated`/`anon` at all** (not just no write policy) —
  the MCQ answer key and rubric binding live there and must never reach
  the browser via any path; read only via `service_role`, with the server
  stripping the answer key before ever handing item content to a client
  (mirrors `src/lib/placement/questions.ts`'s `toPublicQuestion()`).
  Versioned content is also structurally immutable once it leaves
  `draft`: a trigger on `assessment_item_versions` rejects any change to
  `item_id`/`version_number`/`item_type`/`prompt`/`answer_key`/
  `rubric_version_id`/`difficulty_band` once status is `reviewed`,
  `active`, or `retired`, and only allows the forward lifecycle
  `draft → reviewed → active → retired` (or `draft → active` directly —
  review is optional, not mandatory). The same pattern protects
  `writing_rubric_versions.criteria`/`version_label` once out of `draft`
  (lifecycle `draft → active → retired`) and
  `assessment_policy_versions.rules`/`policy_area`/`version_label` once
  out of `draft` (same lifecycle) — a rubric or policy that has ever
  governed a real outcome must stay auditable, never silently rewritten
  in place; a content revision is always a new version row.
  `language_assessments` itself protects `source_cefr_level` as
  identity (immutable from creation) and treats
  `target_cefr_level`/`policy_version_id`/`submitted_at`/`completed_at`
  as write-once (settable from `NULL`, never changeable afterward) for
  the same auditability reason.
- **Cross-language and empty-attempt guards inside `cefr_v2_create_assessment`.**
  Item selection (`src/lib/assessment/itemSelection.ts`) already filters
  by `target_language_code`, but the SQL function does not trust that: it
  independently re-checks each served item version's own
  `assessment_items.target_language_code` against the assessment's
  `target_language_code` and rolls back the whole attempt (including the
  just-inserted `language_assessments` row) if they ever disagree, and it
  rejects an empty/`null` item-version list outright before writing
  anything — a zero-item "completed" assessment would be meaningless.
- **Mixed-CEFR-band evidence is left honestly unresolved, never guessed.**
  `cefr_v2_submit_assessment` groups a skill's answered items by CEFR
  band; it only resolves one `estimated_level` when every answered item
  for that skill in the attempt shares exactly one band
  (`count(distinct cefr_target) = 1`) — never by picking an arbitrary row
  (the removed `limit 1` this replaced could silently depend on
  unspecified row order). When a skill's evidence spans more than one
  band — not possible via today's single-band item selection, but the
  architecture anticipates a future boundary/adaptive selector — the
  function records the real `raw_score`/`items_administered`/
  `items_correct` evidence but leaves `estimated_level` `NULL` rather
  than averaging across bands (which `src/lib/assessment/scoring.ts`'s
  `resolveSkillEstimatedLevel` mirrors and is tested for row-order
  independence).
- **`cefr_v2_finalize_writing_skill` derives its own evidence counts,
  never trusts the caller's.** It no longer accepts
  `p_items_administered`/`p_items_evaluated` as parameters at all — it
  counts the assessment's own persisted writing `assessment_responses`
  and `writing_evaluations` rows itself and refuses to complete
  (`raise exception`) unless every administered writing response
  genuinely has a real evaluation, plus range-checks `p_raw_score` (the
  one number it cannot re-derive without duplicating
  `computeWritingRawScore`'s criterion-averaging a second time in SQL).
  `src/lib/assessment/submit.ts` also no longer discards this RPC's error
  silently — a rejection is logged and the assessment stays `evaluating`
  for a later retry, rather than a fire-and-forget call hiding a real
  failure.
- **Legacy placement v1 is untouched and un-promoted.** Its bank
  (`src/lib/placement/banks/{en,fr}.ts`), scoring
  (`src/lib/placement/scoring.ts`), and historical
  `placement_test_attempts` rows are unchanged. v1's per-item metadata
  (category → skill, level → cefr_target, prompt/options, answer key)
  maps losslessly to v2's shape — see
  `src/lib/assessment/legacyImport.ts`'s `mapLegacyPlacementBankToV2Items`
  (pure mapping function, tested against the real `en` bank). **This
  function does not write to the database** — actually seeding v2 with
  this (or any) content is a deliberate, separate, human-reviewed step,
  not a side effect of a migration or of running the app. Until that
  happens, every language's v2 item bank is genuinely empty, so
  `startAssessmentAction` honestly reports "not available yet" for every
  language today — the same fail-closed contract v1's
  `getPlacementBank()` already uses for languages with no bank.
- **The v1 MCQ evidence-gate is carried forward, not reinvented.**
  `src/lib/assessment/constants.ts`'s `SKILL_PASS_THRESHOLD` (2/3) is the
  exact same `PASS_THRESHOLD` `src/lib/placement/scoring.ts` already uses
  — a skill is "estimated" at a level only when at least 2/3 of that
  skill's items in one attempt are correct. `cefr_v2_submit_assessment`
  applies this per skill (not blended); `src/lib/assessment/scoring.ts`'s
  `isSkillEvidencePassing`/`computeSkillRawScore` mirror the SQL formula
  for documentation/testing, same "mirror, not drive" relationship
  `languageBrain/scoring.ts` has with its generated column.
- **No simple average, ever, for a CONFIRMATION decision.** Per-skill
  results are never blended into one number to decide a confirmed level.
  "Confirmed level = highest level for which required domains meet the
  relevant minimum requirements AND overall evidence is sufficient" is
  the product concept — but the exact thresholds are undefined (see
  below), so no code computes this at all yet.
- **Writing assessment is real, not faked, and not confirmation-capable.**
  `src/lib/assessment/writingEvaluation.ts` calls the existing OpenAI
  provider with a fixed, versioned rubric (`writing_rubric_versions`),
  structured Zod-validated output
  (`WritingEvaluationOutputSchema` — exactly the rubric's own criterion
  keys, nothing else: no CEFR level, no pass/fail, no user id, no policy
  version), prompt-injection-resistant instructions (the learner's text
  is untrusted content to evaluate, never instructions to follow — same
  posture as the lesson engine's system prompt). A response that fails
  validation or doesn't cover exactly the rubric's criteria is rejected
  as a whole — there is no partial/fake fallback score, unlike Language
  Brain's error classification (categorization has a safe deterministic
  fallback; writing evaluation genuinely cannot). Failure surfaces as the
  assessment's real `'failed'` lifecycle state, retryable via
  `src/lib/assessment/submit.ts`'s orchestration
  (`evaluateAndFinalizeWriting`), which mirrors
  `languageBrain/ingest.ts`'s retry-safe pattern closely.
- **Listening and speaking stay `NULL`, always, in this phase.** No real
  audio/microphone pipeline exists. `cefr_skill_states` simply has no row
  for these skills for anyone — the UI (`AssessmentView`) shows "Not
  assessed yet," never a zero, never an inferred score from text.
- **C2 safeguard**: `assessment_items.cefr_target`/`assessment_skill_results.estimated_level`/
  `cefr_skill_states.estimated_level`/`confirmed_level` all CHECK-constrain
  to A1–C2, so the schema doesn't block C2 — but nothing in this phase's
  application code ever credits C2 from a short MCQ set (same reasoning
  placement v1 already applies), and full C2 CONFIRMATION additionally
  requires the (currently nonexistent) `level_confirmation` policy.
- **Readiness architecture, no readiness decision.**
  `src/lib/assessment/readiness.ts`'s `computeReadinessEvidenceSnapshot`
  deterministically aggregates REAL Language Brain evidence (grammar
  score/evidence count, due review count, recurring-error count, lessons
  ingested) into `level_readiness_states` — facts, never a verdict.
  `status` is hardcoded to `'readiness_pending'` in every code path; the
  database CHECK also allows `'ready'`/`'almost_ready'`/`'not_ready_yet'`
  so a future policy-aware decision algorithm doesn't need a migration,
  but nothing today is capable of writing those values.
- **Policy registry, deliberately empty**
  (`assessment_policy_versions`, `src/lib/assessment/policy.ts`). Every
  gate that could promote/confirm something calls
  `getActivePolicy(policyArea)` first; a `null` result (the only result
  today, for every area) means "no legitimate decision can be made yet" —
  never substitute a guessed threshold. **Do not insert a placeholder
  "active" policy with invented numbers to make something "work."**
  Undefined thresholds, deliberately, until a human explicitly decides
  them: minimum evidence volume per skill, minimum skill score, which
  skills are required for confirmation, cross-skill requirements,
  READY/ALMOST_READY/NOT_READY_YET boundaries, evidence recency window,
  reassessment interval, bridge-plan completion criteria. When one of
  these is decided, a human authors and activates a real
  `assessment_policy_versions` row (SQL, or a future admin tool) — no
  code change is needed here for it to take effect.
- **Idempotency & concurrency**: `language_assessments.status` moves
  through a fixed lifecycle (`in_progress → submitted →
  [evaluating] → completed | failed`, or `→ abandoned`) enforced by a
  structural trigger even against `service_role`.
  `cefr_v2_submit_assessment`/`cefr_v2_finalize_writing_skill` both take
  a `for update` row lock and check-then-transition status, so two
  concurrent submit/finalize calls can never double-count skill evidence
  or double-confirm anything — the second call sees the already-advanced
  status and no-ops. `assessment_responses` has a unique
  `(assessment_id, item_id)` constraint and becomes fully immutable the
  instant its parent assessment leaves `in_progress`, via a trigger that
  reads the parent's live status on every update attempt.
- **Security/write model** — same threat model as Phase 3/4: browser and
  server share the same `authenticated` credential, so
  `authenticated`/`anon` get an explicit `revoke` (not just "no policy")
  on every write to every table in this migration. All writes go through
  four focused SQL functions (`cefr_v2_create_assessment`,
  `cefr_v2_record_response`, `cefr_v2_submit_assessment`,
  `cefr_v2_finalize_writing_skill`), granted execute **only** to
  `service_role`. `service_role` is used in exactly one new module,
  `src/lib/assessment/submit.ts` (plus `itemSelection.ts`/`readiness.ts`
  reading answer-key-bearing or derived-state tables) — never in a Client
  Component, never `NEXT_PUBLIC_`. Reads stay on the ordinary per-request
  RLS client (`src/lib/assessment/dal.ts`, `policy.ts`) wherever the data
  is the learner's own evidence.
- **Routes/UI**: one new dashboard route, `/dashboard/assessment`
  (`src/app/(dashboard)/dashboard/assessment/page.tsx`,
  `src/features/assessment/components/AssessmentView.tsx`) — a real,
  read-only view of confirmed/learning level, skill profile, assessment
  history, and bridge plans, plus a genuinely working (not fake) "Start
  CEFR Assessment" button that currently always reports "not available
  yet" (no v2 content seeded — see legacy import above). The dashboard
  header tag now says "Estimated B1" or "Confirmed B1" instead of a bare,
  ambiguous level. No existing onboarding route or step was touched.
- **Automated tests**: `src/lib/assessment/*.test.ts`,
  `src/features/assessment/actions.test.ts`,
  `src/features/onboarding/actions.test.ts` — run with `npm run test`.
  Deterministic logic (evidence-gate math, mixed-CEFR-band evidence
  resolution and its row-order independence in
  `scoring.test.ts`'s `resolveSkillEstimatedLevel` suite, item selection
  bounding and language/skill isolation, legacy mapping losslessness,
  AI-writing-evaluation schema/coverage validation and prompt-injection
  resistance, submit/finalize idempotency and retry-safety — including
  that the finalize RPC's own rejection is logged rather than silently
  discarded, and that it is called without
  `p_items_administered`/`p_items_evaluated` — DAL language isolation,
  that Server Actions accept no field through which a client could set a
  trusted score/level, and that onboarding's own `user_languages`
  upsert/update payloads never include `confirmed_cefr_level`/
  `learning_cefr_level`/`assessment_status`) is exercised directly.
  **What Vitest cannot prove**: live Postgres row-locking under true
  concurrency, RLS/grant enforcement (including the table-level revoke
  plus column-level re-grant on `user_languages` — see the
  `has_table_privilege`/`has_column_privilege` verification query in
  `0007_cefr_assessment_v2.sql` for the actual, checkable proof), and
  trigger behavior — including the item-version/rubric/policy content-
  immutability triggers, the cross-language and empty-item-list guards in
  `cefr_v2_create_assessment`, and `cefr_v2_finalize_writing_skill`'s own
  evidence-count derivation — code-reviewed against
  `0007_cefr_assessment_v2.sql` instead.
  `supabase/verify_0007_cefr_assessment_v2.sql` is the actual runnable
  check for all of this: a single transaction (rolled back at the end,
  leaves no trace) that must be run with a direct Postgres connection
  (Supabase SQL editor or `psql` — not the REST/PostgREST API, which
  can't run arbitrary multi-statement SQL or `set local role`) against a
  project 0007 has already been applied to. It exercises privilege
  enforcement by actually impersonating an authenticated user via JWT
  claims, not just reading grant statements, and covers items 1–14 of the
  Phase 5 hardening report's manual verification list.

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
  Component, or via a `NEXT_PUBLIC_` variable. The AI lesson engine, the
  Language Brain, and CEFR Assessment v2 are the only places this
  codebase uses it (`SUPABASE_SERVICE_ROLE_KEY` via
  `src/lib/supabase/serviceRole.ts`), because `lesson_sessions`/
  `lesson_messages`, every `language_brain_*` table, and every CEFR v2
  table (`language_assessments`, `assessment_responses`,
  `assessment_items`/`assessment_item_versions`, etc.) need writes — and,
  for the two item tables, even reads — no `auth.uid()`-scoped RLS policy
  could make trustworthy — see the "AI lesson engine," "Language Brain,"
  and "CEFR Assessment v2" sections above before reusing this client
  anywhere else or granting `authenticated` write (or, for item tables,
  read) access to any of these tables.
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
