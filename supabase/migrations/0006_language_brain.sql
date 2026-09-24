-- Phase 4 schema: the Language Brain — durable, cross-session learning
-- memory derived from completed AI lessons. Additive only — does not
-- modify 0001_init.sql through 0005_ai_lesson_engine.sql.
--
-- OWNERSHIP MODEL: every table here is keyed by (user_id,
-- target_language_code), NEVER teacher_id. Switching teachers must never
-- reset or fork this data — see AGENTS.md's "Language Brain" section,
-- "Teacher switching."
--
-- SECURITY MODEL (same threat model as 0005_ai_lesson_engine.sql — read
-- that file's header first): a browser's Supabase session and a Server
-- Action's server-side client are the SAME `authenticated` credential.
-- Language Brain rows are entirely SERVER-DERIVED from trusted lesson
-- evidence (never client-submitted claims like "I made this error" or
-- "my grammar score is 90"), so — exactly like lesson_sessions/
-- lesson_messages — `authenticated`/`anon` get NO insert/update/delete
-- grant on any table below. All writes go through two SECURITY-reviewed
-- paths, both using service_role (src/lib/supabase/serviceRole.ts):
--   1. src/lib/languageBrain/ingest.ts, which calls the
--      language_brain_ingest_lesson() function below to atomically turn
--      one completed lesson_session into durable brain state.
--   2. src/features/languageBrain/actions.ts, which calls
--      language_brain_record_review_result() to atomically advance one
--      review item's spaced-repetition schedule.
-- Both functions are granted execute ONLY to service_role (explicit
-- revoke from public/authenticated/anon) — never make either
-- `security definer` + grant it to `authenticated`; that would reopen
-- the exact hole 0005's header comment warns about, since it only
-- changes who can perform the write, not who can call the function with
-- fabricated arguments. Reads stay on the ordinary per-request RLS client
-- (src/lib/supabase/server.ts), scoped to auth.uid() — a real backstop
-- against a DAL ownership-check bug, same as Phase 3.

-- language_brain_profiles: one row per (user, target language) — the
-- anchor row recording how much evidence has been ingested so far.
create table if not exists public.language_brain_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language_code text not null,
  lessons_ingested_count int not null default 0,
  last_ingested_lesson_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_language_code)
);

alter table public.language_brain_profiles enable row level security;

create policy "Users can view their own language brain profile"
  on public.language_brain_profiles for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.language_brain_profiles from authenticated, anon;

create index if not exists language_brain_profiles_user_id_idx
  on public.language_brain_profiles (user_id);

create trigger language_brain_profiles_set_updated_at
  before update on public.language_brain_profiles
  for each row execute function public.set_updated_at();

-- language_brain_skill_states: normalized per-skill evidence state.
-- Phase 4 only ever writes 'grammar' (see src/lib/languageBrain/scoring.ts
-- for the exact, explainable formula — a cumulative percentage of
-- learner turns with no grammar-family correction, never an invented
-- number). The other six skills are listed in the CHECK constraint so
-- future phases (pronunciation, listening, ...) don't need a migration
-- to add a new skill row shape, but application code must never write
-- reading/writing/speaking/listening/pronunciation in Phase 4 — a
-- missing row means "not assessed yet," which the UI must show
-- explicitly rather than treating as zero.
--
-- CONCURRENCY: `score` is stored as raw cumulative counters
-- (positive_evidence_count / evidence_count), never as a precomputed
-- final percentage passed in from application code. An earlier version
-- of this migration had the caller read the prior score, compute a new
-- final score in TypeScript, and pass that final value in — two
-- concurrent ingestions for the same (user, target_language) could both
-- read the same stale prior state and the second write would silently
-- clobber the first lesson's contribution. Storing raw counters and
-- accumulating them via `INSERT ... ON CONFLICT DO UPDATE SET x = x +
-- excluded.x` (see language_brain_ingest_lesson below) is Postgres's
-- standard atomic-increment pattern: it takes the necessary row lock as
-- part of conflict resolution, so concurrent ingestions correctly ADD
-- their contributions instead of one overwriting the other, with no
-- explicit SELECT ... FOR UPDATE needed. `score` is a GENERATED column
-- computed by Postgres itself from the two raw counters — there is
-- exactly one place this percentage is ever computed, so it can never
-- drift out of sync with the counters, and repeated accumulation never
-- compounds rounding error the way re-averaging a previously-rounded
-- percentage would.
create table if not exists public.language_brain_skill_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language_code text not null,
  skill text not null,
  -- Cumulative learner turns with no grammar-family correction, across
  -- every lesson ingested so far.
  positive_evidence_count int not null default 0,
  -- Cumulative learner turns total, across every lesson ingested so far.
  evidence_count int not null default 0,
  score int generated always as (
    case when evidence_count > 0
      then round((100.0 * positive_evidence_count) / evidence_count)::int
      else null
    end
  ) stored,
  last_evidence_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_language_code, skill)
);

alter table public.language_brain_skill_states
  add constraint language_brain_skill_states_skill_check
    check (skill in (
      'vocabulary', 'grammar', 'reading', 'writing', 'speaking', 'listening', 'pronunciation'
    ));

alter table public.language_brain_skill_states
  add constraint language_brain_skill_states_score_range_check
    check (score is null or (score >= 0 and score <= 100));

alter table public.language_brain_skill_states
  add constraint language_brain_skill_states_evidence_invariant_check
    check (positive_evidence_count >= 0 and positive_evidence_count <= evidence_count);

alter table public.language_brain_skill_states enable row level security;

create policy "Users can view their own skill states"
  on public.language_brain_skill_states for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.language_brain_skill_states from authenticated, anon;

create index if not exists language_brain_skill_states_user_lang_idx
  on public.language_brain_skill_states (user_id, target_language_code);

create trigger language_brain_skill_states_set_updated_at
  before update on public.language_brain_skill_states
  for each row execute function public.set_updated_at();

-- language_brain_error_patterns: one row per (user, target language,
-- normalized pattern key). A single correction is NOT automatically
-- "recurring" — occurrence_count starts at 1 and only a SECOND distinct
-- lesson producing the same pattern_key increments it. is_recurring is a
-- generated column so the threshold can never be spoofed by a write path
-- that forgets to set it — see RECURRING_ERROR_THRESHOLD in
-- src/lib/languageBrain/constants.ts (kept at 2 here and there together).
create table if not exists public.language_brain_error_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language_code text not null,
  category text not null,
  pattern_key text not null,
  example_original text not null,
  example_corrected text not null,
  explanation text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrence_count int not null default 1,
  is_recurring boolean generated always as (occurrence_count >= 2) stored,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_language_code, pattern_key)
);

alter table public.language_brain_error_patterns
  add constraint language_brain_error_patterns_category_check
    check (category in (
      'grammar', 'vocabulary', 'article', 'preposition', 'tense',
      'agreement', 'word_order', 'spelling', 'register', 'other'
    ));

alter table public.language_brain_error_patterns
  add constraint language_brain_error_patterns_status_check
    check (status in ('active', 'resolved'));

alter table public.language_brain_error_patterns enable row level security;

create policy "Users can view their own error patterns"
  on public.language_brain_error_patterns for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.language_brain_error_patterns from authenticated, anon;

create index if not exists language_brain_error_patterns_user_lang_idx
  on public.language_brain_error_patterns (user_id, target_language_code);

create trigger language_brain_error_patterns_set_updated_at
  before update on public.language_brain_error_patterns
  for each row execute function public.set_updated_at();

-- language_brain_vocabulary: one row per (user, target language,
-- canonical form). mastery_score/review fields are populated only once
-- real spaced-repetition evidence exists (see language_brain_review_items
-- and src/lib/languageBrain/spacedRepetition.ts) — a word is never
-- "mastered" just because it appeared once in a lesson.
create table if not exists public.language_brain_vocabulary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language_code text not null,
  canonical_form text not null,
  surface_form text not null,
  example_sentence text,
  translation text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  encounter_count int not null default 1,
  mastery_score int,
  review_stage int not null default 1,
  next_review_at timestamptz,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_language_code, canonical_form)
);

alter table public.language_brain_vocabulary
  add constraint language_brain_vocabulary_mastery_score_range_check
    check (mastery_score is null or (mastery_score >= 0 and mastery_score <= 100));

alter table public.language_brain_vocabulary
  add constraint language_brain_vocabulary_review_stage_range_check
    check (review_stage >= 1 and review_stage <= 4);

alter table public.language_brain_vocabulary enable row level security;

create policy "Users can view their own vocabulary memory"
  on public.language_brain_vocabulary for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.language_brain_vocabulary from authenticated, anon;

create index if not exists language_brain_vocabulary_user_lang_idx
  on public.language_brain_vocabulary (user_id, target_language_code);

create index if not exists language_brain_vocabulary_next_review_idx
  on public.language_brain_vocabulary (user_id, target_language_code, next_review_at);

create trigger language_brain_vocabulary_set_updated_at
  before update on public.language_brain_vocabulary
  for each row execute function public.set_updated_at();

-- language_brain_review_items: the durable spaced-repetition queue.
-- Phase 4 only ever creates source_type = 'vocabulary' rows (no Review
-- Mode UI exists yet to test recall of a grammar pattern) — 'error_pattern'
-- is listed in the CHECK constraint so that mode can be added later
-- without a migration, but application code must not populate it yet.
-- One row per source item (not a log of every review event): a review
-- result updates the existing row's stage/due_at in place.
create table if not exists public.language_brain_review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language_code text not null,
  source_type text not null,
  source_id uuid not null,
  review_stage int not null default 1,
  due_at timestamptz not null,
  status text not null default 'pending',
  last_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_language_code, source_type, source_id)
);

alter table public.language_brain_review_items
  add constraint language_brain_review_items_source_type_check
    check (source_type in ('vocabulary', 'error_pattern'));

alter table public.language_brain_review_items
  add constraint language_brain_review_items_status_check
    check (status in ('pending', 'completed', 'skipped'));

alter table public.language_brain_review_items
  add constraint language_brain_review_items_last_result_check
    check (last_result is null or last_result in ('again', 'good'));

alter table public.language_brain_review_items
  add constraint language_brain_review_items_stage_range_check
    check (review_stage >= 1 and review_stage <= 4);

alter table public.language_brain_review_items enable row level security;

create policy "Users can view their own review items"
  on public.language_brain_review_items for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.language_brain_review_items from authenticated, anon;

create index if not exists language_brain_review_items_due_idx
  on public.language_brain_review_items (user_id, target_language_code, due_at);

create trigger language_brain_review_items_set_updated_at
  before update on public.language_brain_review_items
  for each row execute function public.set_updated_at();

-- language_brain_ingestions: the idempotency ledger. One row per
-- lesson_session, ever — `unique (lesson_session_id)` is the actual
-- guarantee that a completed lesson cannot be ingested twice. A failed
-- attempt updates this SAME row to status = 'failed' and is retried by
-- calling language_brain_ingest_lesson() again (which no-ops if the row
-- has already reached 'completed'); no in-memory flag is involved. See
-- src/lib/languageBrain/ingest.ts for the full retry model.
create table if not exists public.language_brain_ingestions (
  id uuid primary key default gen_random_uuid(),
  lesson_session_id uuid not null references public.lesson_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language_code text not null,
  status text not null default 'pending',
  extraction_version text not null,
  errors_extracted_count int not null default 0,
  vocabulary_extracted_count int not null default 0,
  review_items_created_count int not null default 0,
  review_items_updated_count int not null default 0,
  skills_updated_count int not null default 0,
  duration_ms int,
  -- Safe, generic failure reason only (see src/lib/utils/errors.ts) —
  -- never a raw provider/database error message.
  error_message text,
  attempt_count int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_session_id)
);

alter table public.language_brain_ingestions
  add constraint language_brain_ingestions_status_check
    check (status in ('pending', 'completed', 'failed'));

alter table public.language_brain_ingestions enable row level security;

create policy "Users can view their own ingestion records"
  on public.language_brain_ingestions for select
  using (auth.uid() = user_id);

-- Deliberately NO insert/update policy for authenticated/anon: ingestion
-- rows are internal pipeline bookkeeping, written only by
-- src/lib/languageBrain/ingest.ts via service_role.
revoke insert, update, delete on public.language_brain_ingestions from authenticated, anon;

create index if not exists language_brain_ingestions_user_id_idx
  on public.language_brain_ingestions (user_id);

create trigger language_brain_ingestions_set_updated_at
  before update on public.language_brain_ingestions
  for each row execute function public.set_updated_at();

-- ============================================================
-- language_brain_ingest_lesson: atomically applies one completed
-- lesson's already-extracted, already-Zod-validated evidence to durable
-- brain state. Runs as a single Postgres transaction (the implicit
-- transaction wrapping any function call) so a crash partway through
-- rolls back everything — a retry re-runs from a clean slate and cannot
-- double-count, which is what makes ingestion idempotent even though
-- Postgres has no distributed-transaction story across the earlier AI
-- classification call and this write.
--
-- Called ONLY from src/lib/languageBrain/ingest.ts via service_role.
-- p_user_id/p_target_language_code are trusted because the CALLER derives
-- them from the lesson_sessions row (itself server-snapshotted at lesson
-- creation) — never from client input. This function does not re-derive
-- or re-check that trust; it is not exposed to authenticated/anon (see
-- the grant at the bottom), so it cannot be reached with fabricated
-- arguments the way a security-definer RPC open to `authenticated` could.
--
-- p_errors / p_vocabulary are jsonb arrays already deduplicated by
-- pattern_key / canonical_form WITHIN this one lesson by the caller —
-- repeating the same mistake five times in one lesson increments
-- occurrence_count by at most 1, not 5, so "recurring" reflects
-- recurrence ACROSS lessons, not noise within one.
-- ============================================================
create or replace function public.language_brain_ingest_lesson(
  p_lesson_session_id uuid,
  p_user_id uuid,
  p_target_language_code text,
  p_extraction_version text,
  p_errors jsonb,
  p_vocabulary jsonb,
  -- THIS LESSON's raw grammar evidence only — never a precomputed final
  -- cumulative score. See the concurrency comment on
  -- language_brain_skill_states above.
  p_grammar_total_turns int,
  p_grammar_positive_turns int,
  p_duration_ms int
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ingestion record;
  v_error jsonb;
  v_vocab jsonb;
  v_existing_id uuid;
  v_errors_count int := 0;
  v_vocab_count int := 0;
  v_review_created int := 0;
  v_review_updated int := 0;
  v_skills_updated int := 0;
begin
  select * into v_ingestion
    from public.language_brain_ingestions
    where lesson_session_id = p_lesson_session_id
    for update;

  if not found then
    raise exception 'language_brain_ingest_lesson: no ingestion row for lesson %', p_lesson_session_id;
  end if;

  if v_ingestion.status = 'completed' then
    -- Idempotent no-op: this lesson was already ingested.
    return jsonb_build_object('alreadyCompleted', true);
  end if;

  for v_error in select * from jsonb_array_elements(p_errors)
  loop
    select id into v_existing_id
      from public.language_brain_error_patterns
      where user_id = p_user_id
        and target_language_code = p_target_language_code
        and pattern_key = (v_error ->> 'patternKey');

    if v_existing_id is null then
      insert into public.language_brain_error_patterns (
        user_id, target_language_code, category, pattern_key,
        example_original, example_corrected, explanation
      ) values (
        p_user_id, p_target_language_code,
        v_error ->> 'category', v_error ->> 'patternKey',
        v_error ->> 'original', v_error ->> 'corrected', v_error ->> 'explanation'
      );
    else
      update public.language_brain_error_patterns
        set occurrence_count = occurrence_count + 1,
            last_seen_at = now(),
            example_original = v_error ->> 'original',
            example_corrected = v_error ->> 'corrected',
            explanation = coalesce(v_error ->> 'explanation', explanation),
            status = 'active'
        where id = v_existing_id;
    end if;

    v_errors_count := v_errors_count + 1;
  end loop;

  for v_vocab in select * from jsonb_array_elements(p_vocabulary)
  loop
    select id into v_existing_id
      from public.language_brain_vocabulary
      where user_id = p_user_id
        and target_language_code = p_target_language_code
        and canonical_form = (v_vocab ->> 'canonicalForm');

    if v_existing_id is null then
      insert into public.language_brain_vocabulary (
        user_id, target_language_code, canonical_form, surface_form, example_sentence,
        review_stage, next_review_at
      ) values (
        p_user_id, p_target_language_code,
        v_vocab ->> 'canonicalForm', v_vocab ->> 'surfaceForm', v_vocab ->> 'exampleSentence',
        1, now() + interval '1 day'
      )
      returning id into v_existing_id;

      insert into public.language_brain_review_items (
        user_id, target_language_code, source_type, source_id, review_stage, due_at
      ) values (
        p_user_id, p_target_language_code, 'vocabulary', v_existing_id, 1, now() + interval '1 day'
      )
      on conflict (user_id, target_language_code, source_type, source_id) do nothing;

      v_review_created := v_review_created + 1;
    else
      update public.language_brain_vocabulary
        set encounter_count = encounter_count + 1,
            last_seen_at = now(),
            example_sentence = coalesce(v_vocab ->> 'exampleSentence', example_sentence)
        where id = v_existing_id;
      -- Re-encountering a word does not touch its review schedule — only
      -- an explicit review result (language_brain_record_review_result)
      -- moves review_stage/due_at/mastery_score.
    end if;

    v_vocab_count := v_vocab_count + 1;
  end loop;

  -- Grammar skill score: THIS LESSON's raw counts are atomically ADDED
  -- to the cumulative counters via ON CONFLICT DO UPDATE's `x = x +
  -- excluded.x` — Postgres's standard concurrency-safe increment
  -- pattern. It takes the row lock needed to serialize concurrent
  -- ingestions for the same (user, target_language_code, 'grammar') row
  -- as part of conflict resolution, so two lessons completing at the
  -- same time both correctly contribute their evidence instead of one
  -- overwriting the other — no explicit `select ... for update` needed,
  -- and no final percentage is ever computed or passed in from
  -- application code (see the concurrency comment on
  -- language_brain_skill_states above; `score` is a generated column).
  -- Zero learner turns this lesson (p_grammar_total_turns = 0) means no
  -- evidence at all, so this block is skipped entirely rather than
  -- writing a fabricated data point or a meaningless zero-turn update.
  if p_grammar_total_turns > 0 then
    insert into public.language_brain_skill_states (
      user_id, target_language_code, skill, positive_evidence_count, evidence_count, last_evidence_at
    ) values (
      p_user_id, p_target_language_code, 'grammar', p_grammar_positive_turns, p_grammar_total_turns, now()
    )
    on conflict (user_id, target_language_code, skill) do update
      set positive_evidence_count = language_brain_skill_states.positive_evidence_count + excluded.positive_evidence_count,
          evidence_count = language_brain_skill_states.evidence_count + excluded.evidence_count,
          last_evidence_at = now();

    v_skills_updated := 1;
  end if;

  insert into public.language_brain_profiles (
    user_id, target_language_code, lessons_ingested_count, last_ingested_lesson_at
  ) values (
    p_user_id, p_target_language_code, 1, now()
  )
  on conflict (user_id, target_language_code) do update
    set lessons_ingested_count = public.language_brain_profiles.lessons_ingested_count + 1,
        last_ingested_lesson_at = now();

  update public.language_brain_ingestions
    set status = 'completed',
        extraction_version = p_extraction_version,
        errors_extracted_count = v_errors_count,
        vocabulary_extracted_count = v_vocab_count,
        review_items_created_count = v_review_created,
        review_items_updated_count = v_review_updated,
        skills_updated_count = v_skills_updated,
        duration_ms = p_duration_ms,
        error_message = null,
        completed_at = now()
    where lesson_session_id = p_lesson_session_id;

  return jsonb_build_object(
    'errorsExtracted', v_errors_count,
    'vocabularyExtracted', v_vocab_count,
    'reviewItemsCreated', v_review_created,
    'skillsUpdated', v_skills_updated
  );
end;
$$;

-- Not exposed to authenticated/anon under any circumstance — see the
-- header comment on this migration and AGENTS.md before changing this.
revoke all on function public.language_brain_ingest_lesson(
  uuid, uuid, text, text, jsonb, jsonb, int, int, int
) from public, authenticated, anon;
grant execute on function public.language_brain_ingest_lesson(
  uuid, uuid, text, text, jsonb, jsonb, int, int, int
) to service_role;
-- (Signature note: the three trailing int params are
-- p_grammar_total_turns, p_grammar_positive_turns, p_duration_ms — see
-- the definition above.)

-- ============================================================
-- language_brain_record_review_result: atomically advances one
-- vocabulary review item's spaced-repetition schedule. The NEW
-- stage/due_at/mastery values are computed by trusted, unit-tested
-- application code (src/lib/languageBrain/spacedRepetition.ts) — this
-- function only persists them, scoped to the owning user, with an
-- optimistic-concurrency check on the item's current stage so a stale
-- computation can never silently overwrite a newer one.
-- ============================================================
create or replace function public.language_brain_record_review_result(
  p_review_item_id uuid,
  p_user_id uuid,
  p_expected_current_stage int,
  p_result text,
  p_new_stage int,
  p_new_due_at timestamptz,
  p_new_mastery_score int
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_source_id uuid;
  v_source_type text;
  v_target_language_code text;
  v_updated int;
begin
  if p_result not in ('again', 'good') then
    raise exception 'language_brain_record_review_result: invalid result %', p_result;
  end if;

  update public.language_brain_review_items
    set review_stage = p_new_stage,
        due_at = p_new_due_at,
        status = 'pending',
        last_result = p_result
    where id = p_review_item_id
      and user_id = p_user_id
      and review_stage = p_expected_current_stage
    returning source_id, source_type, target_language_code into v_source_id, v_source_type, v_target_language_code;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    -- Either the item doesn't belong to this user, doesn't exist, or was
    -- already advanced by a concurrent request since the caller read its
    -- stage. Either way, refuse rather than overwrite with stale data.
    return false;
  end if;

  if v_source_type = 'vocabulary' then
    update public.language_brain_vocabulary
      set review_stage = p_new_stage,
          next_review_at = p_new_due_at,
          last_reviewed_at = now(),
          mastery_score = p_new_mastery_score
      where id = v_source_id
        and user_id = p_user_id
        and target_language_code = v_target_language_code;
  end if;

  return true;
end;
$$;

revoke all on function public.language_brain_record_review_result(
  uuid, uuid, int, text, int, timestamptz, int
) from public, authenticated, anon;
grant execute on function public.language_brain_record_review_result(
  uuid, uuid, int, text, int, timestamptz, int
) to service_role;
