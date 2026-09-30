-- Phase: CEFR Assessment v2 — durable architecture for confirmed vs.
-- learning CEFR level, skill-specific evidence, item versioning, and a
-- deliberately-inactive assessment policy registry. Additive only — does
-- not modify 0001_init.sql through 0006_language_brain.sql. Not applied
-- remotely by this change; review and apply manually.
--
-- ============================================================
-- PRODUCT PRINCIPLE (read before touching this file)
-- ============================================================
-- HelloMova distinguishes LEARNING level from CONFIRMED level.
-- Language Brain (0006) predicts readiness from lesson evidence.
-- Assessment (this migration) is what CONFIRMS a level.
-- Language Brain must NEVER auto-promote a confirmed level — completing
-- lessons alone can never turn a confirmed B1 into a confirmed B2. That
-- guarantee is structural here: no function in this migration ever sets
-- user_languages.confirmed_cefr_level or cefr_skill_states.confirmed_level
-- to a non-null value, because doing so honestly requires an ACTIVE row in
-- assessment_policy_versions, and this migration inserts none. See
-- "POLICY REGISTRY — DELIBERATELY EMPTY" below.
--
-- ============================================================
-- SECURITY MODEL (same threat model as 0005/0006 — read those headers
-- first if you haven't): a browser's Supabase session and a Server
-- Action's server-side client are the SAME `authenticated` credential.
-- Every table below holds either (a) the learner's own answer to a
-- question, which is real user input but must never be trusted to
-- self-report correctness, or (b) fully server-derived evaluation state
-- (skill results, confirmed level, readiness, bridge plans), which the
-- browser must never be able to set directly at all. Accordingly:
--   - `authenticated`/`anon` get NO insert/update/delete grant on any
--     table in this migration (explicit revoke, not just "no policy").
--   - `assessment_items` / `assessment_item_versions` /
--     `writing_rubric_versions` additionally get NO select policy either
--     — these carry answer keys and rubric definitions that must never
--     reach the browser via ANY path, including a hypothetical direct
--     Supabase query bypassing the server's public-shape stripping. Only
--     service_role (which bypasses RLS) can read them.
--   - All writes go through three focused SQL functions
--     (cefr_v2_create_assessment, cefr_v2_record_response,
--     cefr_v2_submit_assessment) plus one small finisher
--     (cefr_v2_finalize_writing_skill), granted execute ONLY to
--     service_role — never `authenticated`, never as an exposed
--     `security definer` RPC, for the same reason 0005/0006 warn about:
--     that would only change who performs the write, not who can call it
--     with fabricated arguments.
--   - Reads stay on the ordinary per-request RLS client where the data is
--     the learner's own evidence (their assessments, responses,
--     skill/readiness/bridge-plan state) — auth.uid() scoping is a real
--     backstop there, same as Phase 3/4.

-- ============================================================
-- SKILL MODEL
-- ============================================================
-- `skill` columns below are plain text with NO check constraint,
-- deliberately — see lesson_sessions.mode's precedent in
-- 0005_ai_lesson_engine.sql for the same reasoning. The six primary
-- domains (grammar, vocabulary, reading, listening, writing, speaking)
-- plus pronunciation (matching language_brain_skill_states' existing
-- vocabulary) are the live set enforced by src/lib/assessment/constants.ts
-- Zod enum. Future CEFR-aligned domains (spoken interaction, written
-- interaction, mediation, sociolinguistic competence, pragmatic
-- competence) can be added to that enum without ever touching this
-- schema — the entire point of skipping a CHECK constraint here.

-- ============================================================
-- assessment_policy_versions — POLICY REGISTRY, DELIBERATELY EMPTY
-- ============================================================
-- Durable, versioned, auditable home for the thresholds this product has
-- explicitly NOT yet decided (minimum evidence volume, minimum skill
-- score, required-skill counts, readiness boundaries, reassessment
-- interval, bridge-plan completion criteria — see AGENTS.md's CEFR v2
-- section for the full list). This table is created EMPTY by this
-- migration and MUST stay empty until a human explicitly authors and
-- activates a real policy row — inserting a placeholder "active" policy
-- with invented numbers here would be exactly the fabrication this
-- architecture exists to prevent. `rules` is intentionally jsonb (its
-- shape is owned by the TypeScript policy types in
-- src/lib/assessment/policy.ts, not by this schema) so new policy shapes
-- never require a migration.
create table if not exists public.assessment_policy_versions (
  id uuid primary key default gen_random_uuid(),
  -- e.g. 'level_confirmation', 'readiness', 'bridge_plan_completion' — no
  -- check constraint: new policy areas are expected over time.
  policy_area text not null,
  version_label text not null,
  status text not null default 'draft',
  rules jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  unique (policy_area, version_label)
);

alter table public.assessment_policy_versions
  add constraint assessment_policy_versions_status_check
    check (status in ('draft', 'active', 'retired'));

-- At most one ACTIVE version per policy area — a real constraint, not
-- just an application convention, so two policies can never silently
-- both claim to govern the same decision.
create unique index if not exists assessment_policy_versions_one_active_per_area_idx
  on public.assessment_policy_versions (policy_area)
  where status = 'active';

alter table public.assessment_policy_versions enable row level security;

-- Policy definitions are product configuration, not personal data — safe
-- for any authenticated learner to read (e.g. a future "how levels are
-- confirmed" help page), and there is nothing here to leak since the
-- table starts, and will normally stay, empty or nearly so.
create policy "Authenticated users can view assessment policies"
  on public.assessment_policy_versions for select
  to authenticated
  using (true);

revoke insert, update, delete on public.assessment_policy_versions from authenticated, anon;

create trigger assessment_policy_versions_set_updated_at
  before update on public.assessment_policy_versions
  for each row execute function public.set_updated_at();

-- Structural backstop: a policy that has ever governed a real outcome
-- (active) or has retired from that role must stay auditable — its
-- identity and rules must never be silently rewritten in place once out
-- of draft, or a past confirmation/readiness decision made under it
-- would become unexplainable after the fact. Draft policies (the only
-- kind this migration ever inserts — none) remain freely editable while
-- authored. Minimal lifecycle matching the existing status CHECK
-- exactly: draft -> active -> retired, forward-only, 'retired' terminal.
create or replace function public.assessment_policy_versions_protect_content()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status is distinct from 'draft' then
    if new.policy_area is distinct from old.policy_area
      or new.version_label is distinct from old.version_label
      or new.rules is distinct from old.rules
    then
      raise exception 'assessment_policy_versions content is immutable once out of draft (status: %) — create a new policy version instead', old.status;
    end if;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status = 'active') or
      (old.status = 'active' and new.status = 'retired')
    ) then
      raise exception 'invalid assessment_policy_versions status transition from % to %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

create trigger assessment_policy_versions_protect_content_trigger
  before update on public.assessment_policy_versions
  for each row execute function public.assessment_policy_versions_protect_content();

-- ============================================================
-- writing_rubric_versions — a fixed, versioned rubric — never an ad hoc
-- AI opinion. Created before assessment_item_versions, which references
-- it. `criteria` shape (task achievement, grammar range and accuracy,
-- vocabulary range and control, coherence and cohesion, register/
-- appropriateness) is owned by src/lib/assessment/schemas.ts's
-- WritingRubricSchema.
-- ============================================================
create table if not exists public.writing_rubric_versions (
  id uuid primary key default gen_random_uuid(),
  version_label text not null unique,
  criteria jsonb not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.writing_rubric_versions
  add constraint writing_rubric_versions_status_check
    check (status in ('draft', 'active', 'retired'));

create unique index if not exists writing_rubric_versions_one_active_idx
  on public.writing_rubric_versions ((true))
  where status = 'active';

alter table public.writing_rubric_versions enable row level security;
revoke select, insert, update, delete on public.writing_rubric_versions from authenticated, anon;

create trigger writing_rubric_versions_set_updated_at
  before update on public.writing_rubric_versions
  for each row execute function public.set_updated_at();

-- Structural backstop: a fixed/versioned rubric must not have its
-- identity (version_label) or its actual criteria silently rewritten
-- once it is no longer a draft — every writing_evaluations row that ever
-- cites this rubric_version_id must stay interpretable against the exact
-- criteria that produced it. Minimal lifecycle matching the existing
-- status CHECK exactly: draft -> active -> retired, forward-only,
-- 'retired' terminal. A revised rubric is a NEW version row, never an
-- edit of this one.
create or replace function public.writing_rubric_versions_protect_content()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status is distinct from 'draft' then
    if new.version_label is distinct from old.version_label
      or new.criteria is distinct from old.criteria
    then
      raise exception 'writing_rubric_versions content is immutable once out of draft (status: %) — create a new rubric version instead', old.status;
    end if;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status = 'active') or
      (old.status = 'active' and new.status = 'retired')
    ) then
      raise exception 'invalid writing_rubric_versions status transition from % to %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

create trigger writing_rubric_versions_protect_content_trigger
  before update on public.writing_rubric_versions
  for each row execute function public.writing_rubric_versions_protect_content();

-- ============================================================
-- assessment_items / assessment_item_versions — trusted, versioned
-- content. Reused by every assessment type/language.
-- ============================================================
-- assessment_items: the STABLE identity/grouping of a question — what it
-- targets, not its exact wording. Content that can legitimately change
-- (prompt text, options, answer key, rubric, difficulty band) lives on
-- assessment_item_versions instead, so a later content revision NEVER
-- retroactively changes what an old response was scored against — see
-- assessment_item_versions and assessment_responses below.
create table if not exists public.assessment_items (
  id uuid primary key default gen_random_uuid(),
  target_language_code text not null,
  skill text not null,
  -- Freeform sub-classification within a skill (e.g. "irregular-verbs",
  -- "reading-comprehension") — not a fixed catalog, so no check
  -- constraint; nullable because not every item needs one.
  subskill text,
  cefr_target text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assessment_items
  add constraint assessment_items_cefr_target_check
    check (cefr_target in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

alter table public.assessment_items enable row level security;
-- Deliberately NO select policy for authenticated/anon — see this
-- migration's header. Items carry no answer key themselves, but the
-- language/skill/level TARGETING metadata here is still part of trusted
-- assessment content the browser should never be able to enumerate
-- directly (that would make it easy to infer which items exist for
-- reconnaissance before an attempt). Read via service_role only.
revoke select, insert, update, delete on public.assessment_items from authenticated, anon;

create index if not exists assessment_items_lookup_idx
  on public.assessment_items (target_language_code, skill, cefr_target);

create trigger assessment_items_set_updated_at
  before update on public.assessment_items
  for each row execute function public.set_updated_at();

-- assessment_item_versions: the actual servable content. A new version
-- number is created whenever wording, options, the answer key, the
-- rubric binding, or the difficulty classification changes — the OLD
-- version row is never edited, only superseded (status -> 'retired').
-- `prompt`/`answer_key` shapes are owned by
-- src/lib/assessment/schemas.ts's Zod schemas (validated on write, not
-- structurally enforced here), matching lesson_messages.metadata's
-- precedent of a jsonb column whose shape is an application contract.
create table if not exists public.assessment_item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.assessment_items (id) on delete cascade,
  version_number int not null,
  -- 'multiple_choice' | 'writing_prompt' today; no check constraint so a
  -- future item type (e.g. a real listening item, once that
  -- infrastructure exists) doesn't need a migration to be introduced —
  -- src/lib/assessment/schemas.ts's Zod enum is the live gate.
  item_type text not null,
  prompt jsonb not null,
  -- Null for rubric-scored types (writing) where there is no single
  -- "correct" answer key — never fabricated, never guessed.
  answer_key jsonb,
  rubric_version_id uuid references public.writing_rubric_versions (id),
  -- Freeform banding within the item's cefr_target (e.g. 'easy' | 'core'
  -- | 'hard') for future exposure-control/psychometrics (AGENTS.md
  -- Section 12) — no check constraint, no invented taxonomy imposed now.
  difficulty_band text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, version_number)
);

alter table public.assessment_item_versions
  add constraint assessment_item_versions_status_check
    check (status in ('draft', 'reviewed', 'active', 'retired'));

-- At most one ACTIVE version per item — the version actually eligible to
-- be served to a new attempt. Multiple retired/draft/reviewed versions
-- may coexist (that's the whole point of versioning).
create unique index if not exists assessment_item_versions_one_active_per_item_idx
  on public.assessment_item_versions (item_id)
  where status = 'active';

alter table public.assessment_item_versions enable row level security;
-- Deliberately NO select policy for authenticated/anon — this is where
-- the MCQ answer_key and rubric binding actually live. See this
-- migration's header comment; this is the single most important RLS
-- decision in this file. Read via service_role only, and the server
-- strips answer_key/rubric before ever sending item content to a browser
-- (mirrors src/lib/placement/questions.ts's toPublicQuestion()).
revoke select, insert, update, delete on public.assessment_item_versions from authenticated, anon;

create index if not exists assessment_item_versions_item_id_idx
  on public.assessment_item_versions (item_id);

create trigger assessment_item_versions_set_updated_at
  before update on public.assessment_item_versions
  for each row execute function public.set_updated_at();

-- Structural backstop for "historical attempts must be reproducible":
-- once a version leaves 'draft', its actual servable CONTENT can never
-- be rewritten in place — a real content change must create a NEW
-- version row instead, exactly as this migration's own header comment
-- already claims. Without this trigger, nothing stops a direct
-- service_role UPDATE from silently rewriting an 'active' or 'retired'
-- version's prompt/answer_key after learners have already answered
-- against it, which would retroactively change what their historical
-- responses were scored against — precisely what assessment_responses'
-- fixed item_version_id is supposed to prevent.
--
-- Deliberate, minimal lifecycle (matches this table's own status CHECK
-- constraint exactly, no state added or removed):
--   draft -> reviewed -> active -> retired
--   draft -> active               (review is optional, not mandatory)
-- 'retired' is terminal — no code path resurrects a retired version;
-- superseding content always means authoring a new version row instead.
create or replace function public.assessment_item_versions_protect_content()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status is distinct from 'draft' then
    if new.item_id is distinct from old.item_id
      or new.version_number is distinct from old.version_number
      or new.item_type is distinct from old.item_type
      or new.prompt is distinct from old.prompt
      or new.answer_key is distinct from old.answer_key
      or new.rubric_version_id is distinct from old.rubric_version_id
      or new.difficulty_band is distinct from old.difficulty_band
    then
      raise exception 'assessment_item_versions content is immutable once out of draft (status: %) — create a new version instead', old.status;
    end if;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status in ('reviewed', 'active')) or
      (old.status = 'reviewed' and new.status = 'active') or
      (old.status = 'active' and new.status = 'retired')
    ) then
      raise exception 'invalid assessment_item_versions status transition from % to %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

create trigger assessment_item_versions_protect_content_trigger
  before update on public.assessment_item_versions
  for each row execute function public.assessment_item_versions_protect_content();

-- ============================================================
-- language_assessments — one row per attempt (initial placement,
-- readiness check, level confirmation, reassessment).
-- ============================================================
create table if not exists public.language_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language_code text not null,
  assessment_type text not null,
  -- The level being bridged FROM (null for a learner's very first
  -- initial_placement, where there is no prior confirmed/estimated level
  -- yet) and the level being targeted (null until an outcome exists to
  -- determine it — never guessed at creation time).
  source_cefr_level text,
  target_cefr_level text,
  -- No 'created' state: cefr_v2_create_assessment inserts item
  -- placeholders in the SAME transaction as the row itself, so an
  -- assessment is answerable ('in_progress') from the instant it exists
  -- — there is never a genuine "row exists but has no items yet" moment,
  -- so that status was cut rather than kept unreachable (AGENTS.md:
  -- "use only states that are genuinely needed").
  status text not null default 'in_progress',
  -- Resolved once a real decision is made against a real active policy —
  -- stays null for every assessment while no policy is active, which in
  -- this migration is all of them. See cefr_v2_submit_assessment.
  policy_version_id uuid references public.assessment_policy_versions (id),
  started_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.language_assessments
  add constraint language_assessments_type_check
    check (assessment_type in (
      'initial_placement', 'level_readiness', 'level_confirmation', 'reassessment'
    ));

alter table public.language_assessments
  add constraint language_assessments_status_check
    check (status in (
      'in_progress', 'submitted', 'evaluating', 'completed', 'failed', 'abandoned'
    ));

alter table public.language_assessments
  add constraint language_assessments_source_level_check
    check (source_cefr_level is null or source_cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

alter table public.language_assessments
  add constraint language_assessments_target_level_check
    check (target_cefr_level is null or target_cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

alter table public.language_assessments enable row level security;

create policy "Users can view their own assessments"
  on public.language_assessments for select
  using (auth.uid() = user_id);

-- Deliberately NO insert/update policy for authenticated/anon: a browser
-- must never be able to create an assessment row directly (it could set
-- its own target_cefr_level/status) or mark one 'completed' itself.
-- Writes go through cefr_v2_create_assessment / cefr_v2_submit_assessment
-- / cefr_v2_finalize_writing_skill (service_role only).
revoke insert, update, delete on public.language_assessments from authenticated, anon;

create index if not exists language_assessments_user_lang_idx
  on public.language_assessments (user_id, target_language_code);

create trigger language_assessments_set_updated_at
  before update on public.language_assessments
  for each row execute function public.set_updated_at();

-- Structural backstop (holds even against service_role, same pattern as
-- lesson_sessions_protect_snapshot_trigger): status may only move forward
-- through the real lifecycle, never backward and never skip a stage
-- outside the functions below. Also protects the historical/auditable
-- fields below from being silently rewritten by a future bug or a
-- hand-run service_role statement outside the intended functions:
--   - source_cefr_level is identity-like (fixed at creation by
--     cefr_v2_create_assessment, alongside user_id/target_language_code/
--     assessment_type) — always immutable, same as those.
--   - target_cefr_level/policy_version_id/submitted_at/completed_at all
--     start NULL and are each set exactly once, at a specific real
--     lifecycle moment (no function in this migration sets
--     target_cefr_level/policy_version_id today — see this migration's
--     header on why: doing so honestly needs an active policy). Once one
--     of these is non-null, it is "write-once": it can never be changed
--     to a different value afterward, which is what makes a completed
--     assessment's outcome auditable rather than silently revisable.
create or replace function public.language_assessments_protect_lifecycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.target_language_code is distinct from old.target_language_code
    or new.assessment_type is distinct from old.assessment_type
    or new.created_at is distinct from old.created_at
    or new.source_cefr_level is distinct from old.source_cefr_level
  then
    raise exception 'language_assessments identity fields (including source_cefr_level) are immutable after creation';
  end if;

  if old.target_cefr_level is not null and new.target_cefr_level is distinct from old.target_cefr_level then
    raise exception 'language_assessments.target_cefr_level cannot be changed once set';
  end if;

  if old.policy_version_id is not null and new.policy_version_id is distinct from old.policy_version_id then
    raise exception 'language_assessments.policy_version_id cannot be changed once set';
  end if;

  if old.submitted_at is not null and new.submitted_at is distinct from old.submitted_at then
    raise exception 'language_assessments.submitted_at cannot be changed once set';
  end if;

  if old.completed_at is not null and new.completed_at is distinct from old.completed_at then
    raise exception 'language_assessments.completed_at cannot be changed once set';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'in_progress' and new.status in ('submitted', 'abandoned')) or
      (old.status = 'submitted' and new.status in ('evaluating', 'completed', 'failed')) or
      (old.status = 'evaluating' and new.status in ('completed', 'failed'))
    ) then
      raise exception 'invalid language_assessments status transition from % to %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

create trigger language_assessments_protect_lifecycle_trigger
  before update on public.language_assessments
  for each row execute function public.language_assessments_protect_lifecycle();

-- ============================================================
-- assessment_responses — one row per item served in one attempt.
-- ============================================================
-- Created (as an unanswered placeholder) at attempt-creation time with
-- item_version_id already fixed — this is what guarantees "every response
-- references the exact item version the learner saw" even before an
-- answer exists. Mutable (server-validated, server-derives correctness)
-- ONLY while the parent assessment is still 'in_progress' — modeling "the
-- learner can change their answer before final submission" as an
-- intentional, real state transition rather than pretending answers are
-- immutable from the first keystroke. Once the parent assessment leaves
-- 'in_progress', the structural trigger below makes every row permanently
-- immutable, including against service_role.
create table if not exists public.assessment_responses (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.language_assessments (id) on delete cascade,
  -- Denormalized owner id, same simple-RLS reasoning as
  -- lesson_messages.user_id.
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.assessment_items (id),
  item_version_id uuid not null references public.assessment_item_versions (id),
  -- Denormalized from the item at placeholder-creation time so skill
  -- aggregation never needs to join back through item_versions.
  skill text not null,
  selected_option_id text,
  -- Learner-authored free text — untrusted content, never instructions;
  -- see writingEvaluation's prompt-injection handling.
  written_response text,
  -- Server-derived only, from the item version's answer_key — never
  -- accepted from the client, and null for rubric-scored (writing) items
  -- where correctness isn't binary.
  is_correct boolean,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, item_id)
);

alter table public.assessment_responses enable row level security;

create policy "Users can view their own assessment responses"
  on public.assessment_responses for select
  using (auth.uid() = user_id);

-- Deliberately NO insert/update/delete policy for authenticated/anon —
-- this is what stops a browser from writing selected_option_id/is_correct
-- directly (it could otherwise mark its own answer "correct"). Writes go
-- through cefr_v2_create_assessment (placeholder creation) and
-- cefr_v2_record_response (server-derived answer + correctness), both
-- service_role only.
revoke insert, update, delete on public.assessment_responses from authenticated, anon;

create index if not exists assessment_responses_assessment_id_idx
  on public.assessment_responses (assessment_id);

create index if not exists assessment_responses_user_id_idx
  on public.assessment_responses (user_id);

create trigger assessment_responses_set_updated_at
  before update on public.assessment_responses
  for each row execute function public.set_updated_at();

-- Structural backstop: once the PARENT assessment is no longer
-- 'in_progress', no response row belonging to it may ever be changed
-- again, for any writer including service_role — the actual mechanism
-- that makes "submitted means immutable" true rather than a convention.
create or replace function public.assessment_responses_protect_after_submission()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_assessment_status text;
begin
  select status into v_assessment_status
    from public.language_assessments
    where id = old.assessment_id;

  if v_assessment_status is distinct from 'in_progress' then
    raise exception 'assessment_responses rows become immutable once the assessment leaves in_progress (current status: %)', v_assessment_status;
  end if;

  if new.assessment_id is distinct from old.assessment_id
    or new.user_id is distinct from old.user_id
    or new.item_id is distinct from old.item_id
    or new.item_version_id is distinct from old.item_version_id
    or new.skill is distinct from old.skill
  then
    raise exception 'assessment_responses identity fields (assessment/item/item_version/skill) are immutable';
  end if;

  return new;
end;
$$;

create trigger assessment_responses_protect_after_submission_trigger
  before update on public.assessment_responses
  for each row execute function public.assessment_responses_protect_after_submission();

create or replace function public.assessment_responses_prevent_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'assessment_responses rows can never be deleted';
end;
$$;

create trigger assessment_responses_prevent_delete_trigger
  before delete on public.assessment_responses
  for each row execute function public.assessment_responses_prevent_delete();

-- ============================================================
-- writing_evaluations — one row per writing assessment_response, holding
-- the AI-produced, Zod-validated, rubric-bound criterion evidence. This
-- is real evaluation evidence (never a fake/fabricated score) but it is
-- NOT itself a confirmed CEFR outcome — see cefr_skill_states below for
-- why "estimated" is the ceiling this evidence can ever reach without an
-- active confirmation policy. Created after assessment_responses, which
-- it references.
-- ============================================================
create table if not exists public.writing_evaluations (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.assessment_responses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rubric_version_id uuid not null references public.writing_rubric_versions (id),
  -- [{ criterion, score, evidence }, ...] — validated against the bound
  -- rubric_version's criteria before this row is ever written.
  criterion_results jsonb not null,
  -- Provenance only (which model produced this) — never a secret, never
  -- logged with any request/response content beyond this structured
  -- result.
  ai_model text,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (response_id)
);

alter table public.writing_evaluations enable row level security;

create policy "Users can view their own writing evaluations"
  on public.writing_evaluations for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.writing_evaluations from authenticated, anon;

create index if not exists writing_evaluations_user_id_idx
  on public.writing_evaluations (user_id);

-- Immutable once written — an evaluation is a historical evidence
-- record, same reasoning as lesson_messages.
create or replace function public.writing_evaluations_prevent_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'writing_evaluations rows are immutable once written';
end;
$$;

create trigger writing_evaluations_prevent_update
  before update on public.writing_evaluations
  for each row execute function public.writing_evaluations_prevent_mutation();

create trigger writing_evaluations_prevent_delete
  before delete on public.writing_evaluations
  for each row execute function public.writing_evaluations_prevent_mutation();

-- ============================================================
-- assessment_skill_results — one row per (assessment, skill): the
-- attempt's per-skill outcome. Immutable historical evidence.
-- ============================================================
create table if not exists public.assessment_skill_results (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.language_assessments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  skill text not null,
  is_assessed boolean not null default false,
  items_administered int not null default 0,
  -- Null when correctness isn't binary for this skill in this attempt
  -- (e.g. writing, which is rubric-scored) — never a fabricated count.
  items_correct int,
  -- A descriptive 0-100 evidence number for THIS skill in THIS attempt —
  -- never itself a CEFR level and never averaged across skills into an
  -- overall figure (see AGENTS.md's "no simple average" section). Null
  -- when is_assessed = false.
  raw_score numeric,
  estimated_level text,
  created_at timestamptz not null default now(),
  unique (assessment_id, skill)
);

alter table public.assessment_skill_results
  add constraint assessment_skill_results_estimated_level_check
    check (estimated_level is null or estimated_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

alter table public.assessment_skill_results
  add constraint assessment_skill_results_raw_score_range_check
    check (raw_score is null or (raw_score >= 0 and raw_score <= 100));

alter table public.assessment_skill_results enable row level security;

create policy "Users can view their own assessment skill results"
  on public.assessment_skill_results for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.assessment_skill_results from authenticated, anon;

create index if not exists assessment_skill_results_user_lang_idx
  on public.assessment_skill_results (user_id, assessment_id);

-- Immutable once written — a per-attempt result is historical evidence,
-- same reasoning as lesson_messages/writing_evaluations.
create or replace function public.assessment_skill_results_prevent_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'assessment_skill_results rows are immutable once written';
end;
$$;

create trigger assessment_skill_results_prevent_update
  before update on public.assessment_skill_results
  for each row execute function public.assessment_skill_results_prevent_mutation();

create trigger assessment_skill_results_prevent_delete
  before delete on public.assessment_skill_results
  for each row execute function public.assessment_skill_results_prevent_mutation();

-- ============================================================
-- cefr_skill_states — the learner's CUMULATIVE per-skill profile for one
-- target language. Distinct from Language Brain's per-lesson evidence
-- (0006) and from a single attempt's assessment_skill_results: this is
-- "what does HelloMova currently believe about this skill," upserted as
-- new assessment evidence arrives.
-- ============================================================
create table if not exists public.cefr_skill_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language_code text not null,
  skill text not null,
  -- 'unassessed' | 'estimated' | 'confirmed'. 'estimated' is reachable
  -- from real deterministic MCQ evidence — the same >= 2/3 evidence-gate
  -- placement v1 already uses (src/lib/assessment/scoring.ts), applied to
  -- whichever single CEFR band the attempt's answered items for this
  -- skill all share (see cefr_v2_submit_assessment's mixed-band handling;
  -- a skill whose evidence spans more than one band in one attempt is
  -- left unresolved here rather than guessed) — carrying forward an
  -- already-reviewed, already-accepted method, not inventing a new one.
  -- 'confirmed' requires an ACTIVE assessment_policy_versions row for
  -- 'level_confirmation' and is therefore unreachable by any code path in
  -- this migration, structurally, not just by convention: see
  -- cefr_v2_submit_assessment / cefr_v2_finalize_writing_skill, neither
  -- of which ever writes 'confirmed'.
  status text not null default 'unassessed',
  estimated_level text,
  confirmed_level text,
  last_assessment_id uuid references public.language_assessments (id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, target_language_code, skill)
);

alter table public.cefr_skill_states
  add constraint cefr_skill_states_status_check
    check (status in ('unassessed', 'estimated', 'confirmed'));

alter table public.cefr_skill_states
  add constraint cefr_skill_states_estimated_level_check
    check (estimated_level is null or estimated_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

alter table public.cefr_skill_states
  add constraint cefr_skill_states_confirmed_level_check
    check (confirmed_level is null or confirmed_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

-- Structural, not just conventional: a row can never claim 'confirmed'
-- status without an actual confirmed_level, and vice versa 'unassessed'
-- can never carry a level at all.
alter table public.cefr_skill_states
  add constraint cefr_skill_states_status_level_consistency_check
    check (
      (status = 'unassessed' and estimated_level is null and confirmed_level is null) or
      (status = 'estimated' and estimated_level is not null) or
      (status = 'confirmed' and confirmed_level is not null)
    );

alter table public.cefr_skill_states enable row level security;

create policy "Users can view their own CEFR skill states"
  on public.cefr_skill_states for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.cefr_skill_states from authenticated, anon;

create index if not exists cefr_skill_states_user_lang_idx
  on public.cefr_skill_states (user_id, target_language_code);

create trigger cefr_skill_states_set_updated_at
  before update on public.cefr_skill_states
  for each row execute function public.set_updated_at();

-- ============================================================
-- level_readiness_states — Language-Brain-derived READINESS EVIDENCE
-- snapshot. Never a promotion decision. See AGENTS.md for the full
-- reasoning; the short version: this table can only ever describe
-- evidence, and `status` can only ever be 'readiness_pending' until a
-- 'readiness' policy is activated, because no code path in this
-- migration or its callers is capable of writing anything else.
-- ============================================================
create table if not exists public.level_readiness_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language_code text not null,
  candidate_target_level text not null,
  status text not null default 'readiness_pending',
  -- Deterministic aggregation of real Language Brain evidence (grammar
  -- score/evidence_count, due review count, recurring error count, last
  -- ingested lesson) — descriptive facts, never a verdict. Shape owned by
  -- src/lib/assessment/readiness.ts.
  evidence_snapshot jsonb not null,
  policy_version_id uuid references public.assessment_policy_versions (id),
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_language_code, candidate_target_level)
);

alter table public.level_readiness_states
  add constraint level_readiness_states_status_check
    check (status in ('readiness_pending', 'ready', 'almost_ready', 'not_ready_yet'));

alter table public.level_readiness_states
  add constraint level_readiness_states_candidate_level_check
    check (candidate_target_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

alter table public.level_readiness_states enable row level security;

create policy "Users can view their own readiness state"
  on public.level_readiness_states for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.level_readiness_states from authenticated, anon;

create index if not exists level_readiness_states_user_lang_idx
  on public.level_readiness_states (user_id, target_language_code);

create trigger level_readiness_states_set_updated_at
  before update on public.level_readiness_states
  for each row execute function public.set_updated_at();

-- ============================================================
-- bridge_plans / bridge_plan_targets — targeted remediation, linked to
-- real identified gaps (Language Brain evidence and/or assessment skill
-- results), never a generic "study more."
-- ============================================================
create table if not exists public.bridge_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language_code text not null,
  source_level text not null,
  target_level text not null,
  status text not null default 'active',
  created_from_assessment_id uuid references public.language_assessments (id),
  policy_version_id uuid references public.assessment_policy_versions (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.bridge_plans
  add constraint bridge_plans_status_check
    check (status in ('active', 'completed', 'abandoned'));

alter table public.bridge_plans
  add constraint bridge_plans_source_level_check
    check (source_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

alter table public.bridge_plans
  add constraint bridge_plans_target_level_check
    check (target_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

alter table public.bridge_plans enable row level security;

create policy "Users can view their own bridge plans"
  on public.bridge_plans for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.bridge_plans from authenticated, anon;

create index if not exists bridge_plans_user_lang_idx
  on public.bridge_plans (user_id, target_language_code);

create trigger bridge_plans_set_updated_at
  before update on public.bridge_plans
  for each row execute function public.set_updated_at();

create table if not exists public.bridge_plan_targets (
  id uuid primary key default gen_random_uuid(),
  bridge_plan_id uuid not null references public.bridge_plans (id) on delete cascade,
  skill text not null,
  gap_description text not null,
  -- Provenance of the gap this target addresses — polymorphic reference,
  -- no cross-type FK, same pattern as language_brain_review_items.source_id
  -- in 0006_language_brain.sql. Never a fabricated gap: source_type +
  -- source_id must point at a real Language Brain or assessment row.
  source_type text not null,
  source_id uuid,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bridge_plan_targets
  add constraint bridge_plan_targets_source_type_check
    check (source_type in (
      'language_brain_error_pattern', 'language_brain_vocabulary',
      'language_brain_review_item', 'assessment_skill_result'
    ));

alter table public.bridge_plan_targets
  add constraint bridge_plan_targets_status_check
    check (status in ('pending', 'completed'));

alter table public.bridge_plan_targets enable row level security;

create policy "Users can view their own bridge plan targets"
  on public.bridge_plan_targets for select
  using (
    exists (
      select 1 from public.bridge_plans
      where bridge_plans.id = bridge_plan_targets.bridge_plan_id
        and bridge_plans.user_id = auth.uid()
    )
  );

revoke insert, update, delete on public.bridge_plan_targets from authenticated, anon;

create index if not exists bridge_plan_targets_plan_id_idx
  on public.bridge_plan_targets (bridge_plan_id);

create trigger bridge_plan_targets_set_updated_at
  before update on public.bridge_plan_targets
  for each row execute function public.set_updated_at();

-- ============================================================
-- user_languages — backward-compatible CONFIRMED vs. LEARNING split.
-- ============================================================
-- current_cefr_level's HISTORICAL MEANING is not redefined: it stays
-- exactly what it always was — placement v1's estimated result — and is
-- never removed or rewritten. Two new columns are added instead:
--   - learning_cefr_level: backfilled from current_cefr_level (an honest
--     "this is roughly what you should be studying" starting reference —
--     the same role current_cefr_level already informally played for the
--     personal plan), going forward updated by the personal-plan/lesson
--     surfaces, not by this migration or by Language Brain.
--   - confirmed_cefr_level: NEVER backfilled from current_cefr_level. A
--     v1 estimated placement is explicitly NOT a confirmed multi-skill
--     result (AGENTS.md/README already say this in the onboarding UI —
--     see src/app/(onboarding)/onboarding/result/page.tsx). Every
--     existing user's confirmed_cefr_level starts NULL and can only ever
--     become non-null through a real, policy-gated level_confirmation
--     assessment outcome — which, since no policy is active, cannot
--     happen yet for anyone, old or new user alike.
--   - assessment_status: a quick per-language summary
--     ('unassessed' | 'estimated' | 'confirmed'), backfilled from whether
--     current_cefr_level was set, kept in sync by the same code paths
--     that maintain cefr_skill_states.
alter table public.user_languages
  add column if not exists confirmed_cefr_level text,
  add column if not exists learning_cefr_level text,
  add column if not exists assessment_status text not null default 'unassessed';

alter table public.user_languages
  add constraint user_languages_confirmed_cefr_level_check
    check (confirmed_cefr_level is null or confirmed_cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

alter table public.user_languages
  add constraint user_languages_learning_cefr_level_check
    check (learning_cefr_level is null or learning_cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

alter table public.user_languages
  add constraint user_languages_assessment_status_check
    check (assessment_status in ('unassessed', 'estimated', 'confirmed'));

-- One-time, idempotent backfill (guarded by `learning_cefr_level is null`
-- so re-running this migration body never clobbers a value already set by
-- a later run of the same statement or by later product code).
update public.user_languages
set learning_cefr_level = current_cefr_level,
    assessment_status = case when current_cefr_level is not null then 'estimated' else 'unassessed' end
where learning_cefr_level is null;

-- ============================================================
-- user_languages — PRIVILEGE MODEL CORRECTION for the three trusted
-- columns just added above. Read this before touching user_languages
-- again.
-- ============================================================
-- user_languages predates this migration. Nothing in 0001_init.sql
-- through 0006_language_brain.sql ever issues a `grant`/`revoke`
-- statement against it (confirmed by inspection) — its table-level
-- INSERT/UPDATE/DELETE/SELECT privileges for `authenticated`/`anon` come
-- entirely from Supabase's own default schema privileges, applied
-- automatically to every public table at creation time. That means
-- `authenticated` holds a broad, TABLE-LEVEL INSERT and UPDATE grant on
-- user_languages today, on top of the row-owner-scoped RLS policies
-- 0001_init.sql layers on top (`auth.uid() = user_id`).
--
-- THIS MATTERS because Postgres computes column-write eligibility as the
-- UNION of table-level and column-level privilege: if a role holds the
-- TABLE-level INSERT/UPDATE grant, that alone authorizes writing to EVERY
-- column, and a column-level `revoke` against that role does nothing to
-- narrow it — the table-level grant is untouched by a column-level
-- revoke and remains sufficient on its own. A column-level-only revoke
-- here (an earlier draft of this migration did exactly that) is
-- therefore a no-op: `authenticated` would still be able to write
-- confirmed_cefr_level/assessment_status via the untouched table-level
-- grant, regardless of what the column-level ACL says. The fix has to
-- remove the table-level grant first, then re-grant column-level
-- INSERT/UPDATE on exactly the columns real application code needs —
-- narrowing FROM a table-level grant, not layering a revoke UNDER one.
--
-- Step 1: revoke the broad table-level grant entirely. This does not
-- touch SELECT or DELETE (0001_init.sql's existing
-- "Users can view their own languages" / "...delete their own languages"
-- policies and their underlying table-level grants are untouched and
-- keep working exactly as before) — only INSERT and UPDATE are narrowed,
-- because only those two can ever originate a value for the three
-- trusted columns.
revoke insert, update
on public.user_languages
from authenticated, anon;

-- Step 2: re-grant column-level INSERT on exactly the columns
-- src/features/onboarding/actions.ts's saveTargetLanguageAction upsert
-- actually writes: `{ user_id, target_language_code, is_primary }`
-- (verified against the live source and locked in by
-- src/features/onboarding/actions.test.ts). current_cefr_level is never
-- part of an INSERT anywhere in the codebase (it is only ever UPDATEd,
-- after a user_languages row already exists, once a real placement test
-- has been scored) — deliberately not included here.
grant insert (user_id, target_language_code, is_primary)
on public.user_languages
to authenticated;

-- Re-grant column-level UPDATE on exactly the columns any real write
-- path touches:
--   - is_primary: the demote-other-languages update in
--     saveTargetLanguageAction, AND the upsert above (PostgREST/
--     supabase-js's generated `ON CONFLICT (...) DO UPDATE SET` assigns
--     EVERY column present in the insert list to `excluded.<column>`,
--     including the conflict-key columns themselves — see below).
--   - current_cefr_level: advanceToResultWithLevel's update, reached
--     only after a real placement test has actually been scored
--     server-side.
--   - user_id / target_language_code: required because the upsert's
--     generated `ON CONFLICT (user_id, target_language_code) DO UPDATE
--     SET user_id = excluded.user_id, target_language_code =
--     excluded.target_language_code, is_primary = excluded.is_primary`
--     needs UPDATE privilege on every column it assigns, including the
--     conflict-key columns, even though the assigned value is always
--     identical to the existing one for those two. Granting this does
--     NOT reopen any escalation: 0001_init.sql's RLS policy
--     (`with check (auth.uid() = user_id)`) still means a row's user_id
--     can only ever be "updated" to the caller's own id — a no-op on any
--     row the caller could reach at all, since the same policy's USING
--     clause already means they could never select/touch a row they
--     don't own in the first place.
-- confirmed_cefr_level / learning_cefr_level / assessment_status are
-- deliberately absent from every grant above — with the broad table-level
-- grant now removed and no column-level grant naming them, `authenticated`/
-- `anon` have NO way to write these three columns, under any statement
-- shape (a bare column-level revoke could never have guaranteed that on
-- its own — see the correction above). Only a role that bypasses
-- privilege checks entirely (service_role, same as it bypasses RLS) can
-- write them, and only via this migration's own SQL functions, and only
-- once a real, policy-gated level_confirmation outcome exists to justify
-- confirmed_cefr_level/assessment_status='confirmed' — which nothing in
-- this migration ever produces (see this file's header). learning_cefr_level
-- is locked down the same way even though no writer exists yet, per
-- AGENTS.md's "maintained by personal-plan/lesson surfaces" description.
grant update (user_id, target_language_code, is_primary, current_cefr_level)
on public.user_languages
to authenticated;

-- ============================================================
-- VERIFICATION QUERY for the privilege model above — read-only,
-- side-effect-free, safe to run standalone at any time (not just right
-- after applying this migration). This is what "authenticated cannot
-- write confirmed_cefr_level/learning_cefr_level/assessment_status"
-- actually means in terms Postgres can answer directly, rather than
-- something inferred from reading grant statements.
-- ============================================================
select
  has_table_privilege('authenticated', 'public.user_languages', 'INSERT') as authenticated_table_insert,
  has_table_privilege('authenticated', 'public.user_languages', 'UPDATE') as authenticated_table_update,
  has_column_privilege('authenticated', 'public.user_languages', 'user_id', 'INSERT') as insert_user_id,
  has_column_privilege('authenticated', 'public.user_languages', 'target_language_code', 'INSERT') as insert_target_language_code,
  has_column_privilege('authenticated', 'public.user_languages', 'is_primary', 'INSERT') as insert_is_primary,
  has_column_privilege('authenticated', 'public.user_languages', 'user_id', 'UPDATE') as update_user_id,
  has_column_privilege('authenticated', 'public.user_languages', 'target_language_code', 'UPDATE') as update_target_language_code,
  has_column_privilege('authenticated', 'public.user_languages', 'is_primary', 'UPDATE') as update_is_primary,
  has_column_privilege('authenticated', 'public.user_languages', 'current_cefr_level', 'UPDATE') as update_current_cefr_level,
  has_column_privilege('authenticated', 'public.user_languages', 'confirmed_cefr_level', 'INSERT') as insert_confirmed_cefr_level,
  has_column_privilege('authenticated', 'public.user_languages', 'confirmed_cefr_level', 'UPDATE') as update_confirmed_cefr_level,
  has_column_privilege('authenticated', 'public.user_languages', 'learning_cefr_level', 'INSERT') as insert_learning_cefr_level,
  has_column_privilege('authenticated', 'public.user_languages', 'learning_cefr_level', 'UPDATE') as update_learning_cefr_level,
  has_column_privilege('authenticated', 'public.user_languages', 'assessment_status', 'INSERT') as insert_assessment_status,
  has_column_privilege('authenticated', 'public.user_languages', 'assessment_status', 'UPDATE') as update_assessment_status;
-- Expected result (one row): authenticated_table_insert = false,
-- authenticated_table_update = false, every insert_*/update_* for
-- user_id/target_language_code/is_primary/current_cefr_level = true, and
-- every insert_*/update_* for confirmed_cefr_level/learning_cefr_level/
-- assessment_status = false.

-- ============================================================
-- cefr_v2_create_assessment — atomically starts an attempt: inserts
-- language_assessments (status 'in_progress') plus one unanswered
-- assessment_responses placeholder per served item version. Item
-- SELECTION itself is a deterministic TypeScript concern
-- (src/lib/assessment/itemSelection.ts) — this function only persists
-- what was already chosen, atomically, so a served item list can never
-- be partially recorded. Two structural guards do NOT trust the caller
-- to have gotten selection right: an empty p_item_version_ids is
-- rejected outright (a zero-item "completed" assessment would be
-- meaningless), and every item version's OWN target_language_code is
-- re-checked against p_target_language_code inside the loop — item
-- selection filters by language today, but this function's job is to be
-- correct even if a future caller (an adaptive selector, a bug, a
-- hand-rolled script) ever passes the wrong id.
-- ============================================================
create or replace function public.cefr_v2_create_assessment(
  p_user_id uuid,
  p_target_language_code text,
  p_assessment_type text,
  p_source_cefr_level text,
  p_item_version_ids uuid[]
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_assessment_id uuid;
  v_item_version_id uuid;
  v_item_id uuid;
  v_skill text;
  v_item_language text;
begin
  -- An assessment with zero served items can never become a meaningful
  -- completed attempt (there would be nothing to score and no evidence
  -- to record) — reject before anything is written, not after.
  if p_item_version_ids is null or array_length(p_item_version_ids, 1) is null then
    raise exception 'cefr_v2_create_assessment: p_item_version_ids must contain at least one item version';
  end if;

  insert into public.language_assessments (
    user_id, target_language_code, assessment_type, source_cefr_level, status, started_at
  ) values (
    p_user_id, p_target_language_code, p_assessment_type, p_source_cefr_level, 'in_progress', now()
  )
  returning id into v_assessment_id;

  foreach v_item_version_id in array p_item_version_ids
  loop
    select iv.item_id, i.skill, i.target_language_code into v_item_id, v_skill, v_item_language
      from public.assessment_item_versions iv
      join public.assessment_items i on i.id = iv.item_id
      where iv.id = v_item_version_id
        and iv.status = 'active';

    if v_item_id is null then
      raise exception 'cefr_v2_create_assessment: item version % is not an active, existing item version', v_item_version_id;
    end if;

    -- Cross-language contamination guard: an assessment for one target
    -- language must never persist an item authored for another, even if
    -- the caller (application code) passed the wrong item_version_id by
    -- mistake. Raising here rolls back the whole transaction, including
    -- the language_assessments row just inserted above — no partial,
    -- contaminated attempt is ever left behind.
    if v_item_language is distinct from p_target_language_code then
      raise exception 'cefr_v2_create_assessment: item version % belongs to target language % but this assessment is for %',
        v_item_version_id, v_item_language, p_target_language_code;
    end if;

    insert into public.assessment_responses (
      assessment_id, user_id, item_id, item_version_id, skill
    ) values (
      v_assessment_id, p_user_id, v_item_id, v_item_version_id, v_skill
    );
  end loop;

  return v_assessment_id;
end;
$$;

revoke all on function public.cefr_v2_create_assessment(uuid, text, text, text, uuid[])
  from public, authenticated, anon;
grant execute on function public.cefr_v2_create_assessment(uuid, text, text, text, uuid[])
  to service_role;

-- ============================================================
-- cefr_v2_record_response — atomically records/updates one answer.
-- Server-derives is_correct from the item version's own answer_key —
-- the browser only ever supplies selected_option_id/written_response,
-- never correctness. No-ops (returns false) once the parent assessment
-- has left 'in_progress' — the structural trigger above would reject the
-- write anyway; this returns a clean boolean instead of a thrown
-- exception for the common "already submitted" case.
-- ============================================================
create or replace function public.cefr_v2_record_response(
  p_response_id uuid,
  p_user_id uuid,
  p_selected_option_id text,
  p_written_response text
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_assessment_id uuid;
  v_assessment_status text;
  v_item_version_id uuid;
  v_answer_key jsonb;
  v_item_type text;
  v_is_correct boolean;
begin
  select r.assessment_id, r.item_version_id
    into v_assessment_id, v_item_version_id
    from public.assessment_responses r
    where r.id = p_response_id
      and r.user_id = p_user_id;

  if v_assessment_id is null then
    return false;
  end if;

  select status into v_assessment_status
    from public.language_assessments
    where id = v_assessment_id;

  if v_assessment_status is distinct from 'in_progress' then
    return false;
  end if;

  select item_type, answer_key into v_item_type, v_answer_key
    from public.assessment_item_versions
    where id = v_item_version_id;

  if v_item_type = 'multiple_choice' then
    v_is_correct := (v_answer_key ->> 'correctOptionId') is not distinct from p_selected_option_id;
  else
    v_is_correct := null;
  end if;

  update public.assessment_responses
    set selected_option_id = p_selected_option_id,
        written_response = p_written_response,
        is_correct = v_is_correct,
        responded_at = now()
    where id = p_response_id;

  return true;
end;
$$;

revoke all on function public.cefr_v2_record_response(uuid, uuid, text, text)
  from public, authenticated, anon;
grant execute on function public.cefr_v2_record_response(uuid, uuid, text, text)
  to service_role;

-- ============================================================
-- cefr_v2_submit_assessment — atomically finalizes the response set:
-- transitions in_progress -> submitted (idempotent no-op if already past
-- in_progress, which is what makes double-submit/retry safe), computes
-- per-skill MCQ results, upserts cefr_skill_states for MCQ-covered skills
-- ONLY (status 'estimated' — never 'confirmed', see this migration's
-- header), and either completes immediately (no writing responses) or
-- moves to 'evaluating' and reports which responses still need AI
-- evaluation. The MCQ per-skill level uses the SAME evidence-gated
-- >= 2/3 threshold placement v1 already uses (mirrored in
-- src/lib/assessment/scoring.ts) — carrying forward an already-reviewed
-- method, never inventing a new threshold.
--
-- MIXED-BAND HONESTY: item selection today (src/lib/assessment/
-- itemSelection.ts) always serves a single CEFR band per skill per
-- attempt, but this function does not assume that — the architecture
-- explicitly anticipates a future boundary/adaptive selector that could
-- serve items from more than one band for the same skill in one attempt.
-- The aggregation below groups by (skill, cefr_target band) and only
-- resolves ONE estimated_level for a skill when its answered items in
-- this attempt all share exactly one band — determined by
-- count(distinct cefr_target), never by an arbitrary `limit 1` row pick,
-- so the result can never depend on unspecified PostgreSQL row order.
-- When a skill's evidence spans more than one band, estimated_level is
-- left NULL (deliberately unresolved) rather than guessing — raw_score/
-- items_administered/items_correct are still recorded honestly as
-- overall per-skill evidence either way. Do NOT replace this with an
-- average across bands: that would be exactly the invented blending
-- AGENTS.md's "no simple average" rule forbids.
--
-- KNOWN DEFECT IN THIS VERSION, FIXED BY 0008 — left unedited here
-- deliberately, since this migration has already been applied to a real
-- project and this file is kept as a historical record of exactly what
-- ran, matching this repo's "never rewrite an applied migration" rule
-- for 0001-0006. The function body below unconditionally INSERTs into
-- cefr_skill_states with status='estimated' even when v_estimated_level
-- is NULL (the mixed-band case) — that INSERT violates
-- cefr_skill_states_status_level_consistency_check (23514) before the
-- ON CONFLICT ... WHERE clause ever gets a chance to matter, since that
-- clause only governs the UPDATE branch of an upsert, not the validity
-- of the INSERT's own row. Live database verification
-- (supabase/verify_0007_cefr_assessment_v2.sql's mixed-band test) caught
-- this against a real project; see
-- 0008_cefr_v2_mixed_band_state_fix.sql for the actual fix (a
-- CREATE OR REPLACE of only this function, guarding the
-- cefr_skill_states write behind `if v_estimated_level is not null`).
-- Any project applying migrations from scratch must run 0008
-- immediately after this one; a project that already applied only this
-- file needs 0008 applied to correct the live function.
-- ============================================================
create or replace function public.cefr_v2_submit_assessment(
  p_assessment_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_target_language_code text;
  v_skill_row record;
  v_estimated_level text;
  v_has_writing boolean;
  v_pending_writing_ids uuid[];
begin
  select status, target_language_code into v_status, v_target_language_code
    from public.language_assessments
    where id = p_assessment_id and user_id = p_user_id
    for update;

  if v_status is null then
    raise exception 'cefr_v2_submit_assessment: assessment % not found for this user', p_assessment_id;
  end if;

  if v_status is distinct from 'in_progress' then
    -- Idempotent: already submitted/evaluating/completed/failed/abandoned
    -- by an earlier call — replay the current state rather than
    -- reprocessing (which would double-count skill evidence).
    return jsonb_build_object('alreadySubmitted', true, 'status', v_status);
  end if;

  update public.language_assessments
    set status = 'submitted', submitted_at = now()
    where id = p_assessment_id;

  -- Per-skill MCQ aggregation. Writing responses (item_type =
  -- 'writing_prompt') are deliberately excluded here — they have no
  -- binary is_correct and are handled by cefr_v2_finalize_writing_skill
  -- after real AI evaluation produces real evidence.
  for v_skill_row in
    select r.skill as skill,
           count(*) as administered,
           count(*) filter (where r.is_correct) as correct,
           count(distinct i.cefr_target) as distinct_bands,
           min(i.cefr_target) as single_band
      from public.assessment_responses r
      join public.assessment_item_versions iv on iv.id = r.item_version_id
      join public.assessment_items i on i.id = r.item_id
      where r.assessment_id = p_assessment_id
        and iv.item_type = 'multiple_choice'
        and r.selected_option_id is not null
      group by r.skill
  loop
    -- `single_band` (a plain min()) is only ever trusted below when
    -- distinct_bands = 1, in which case it IS the one band present —
    -- deterministic and order-independent, unlike the removed `limit 1`
    -- pick over assessment_responses this replaced.
    v_estimated_level := case
      when v_skill_row.distinct_bands = 1
           and v_skill_row.correct::numeric / v_skill_row.administered >= (2.0 / 3.0)
      then v_skill_row.single_band
      else null
    end;

    insert into public.assessment_skill_results (
      assessment_id, user_id, skill, is_assessed, items_administered, items_correct, raw_score, estimated_level
    ) values (
      p_assessment_id, p_user_id, v_skill_row.skill, true, v_skill_row.administered, v_skill_row.correct,
      round(100.0 * v_skill_row.correct / v_skill_row.administered, 2), v_estimated_level
    )
    on conflict (assessment_id, skill) do nothing;

    insert into public.cefr_skill_states (
      user_id, target_language_code, skill, status, estimated_level, last_assessment_id
    ) values (
      p_user_id, v_target_language_code, v_skill_row.skill, 'estimated', v_estimated_level, p_assessment_id
    )
    on conflict (user_id, target_language_code, skill) do update
      set status = 'estimated',
          estimated_level = excluded.estimated_level,
          last_assessment_id = excluded.last_assessment_id
      where excluded.estimated_level is not null;
  end loop;

  select array_agg(r.id) into v_pending_writing_ids
    from public.assessment_responses r
    join public.assessment_item_versions iv on iv.id = r.item_version_id
    where r.assessment_id = p_assessment_id
      and iv.item_type = 'writing_prompt';

  v_has_writing := coalesce(array_length(v_pending_writing_ids, 1), 0) > 0;

  if v_has_writing then
    update public.language_assessments
      set status = 'evaluating'
      where id = p_assessment_id;

    return jsonb_build_object('pendingWritingResponseIds', to_jsonb(v_pending_writing_ids));
  end if;

  update public.language_assessments
    set status = 'completed', completed_at = now()
    where id = p_assessment_id;

  return jsonb_build_object('completed', true);
end;
$$;

revoke all on function public.cefr_v2_submit_assessment(uuid, uuid)
  from public, authenticated, anon;
grant execute on function public.cefr_v2_submit_assessment(uuid, uuid)
  to service_role;

-- ============================================================
-- cefr_v2_finalize_writing_skill — atomically records the writing
-- skill's result (from already-inserted, already-validated
-- writing_evaluations rows) and completes the assessment. Called once
-- per assessment, after every pending writing response has either been
-- evaluated (a writing_evaluations row exists) or the caller has decided
-- to fail the assessment instead (see src/lib/assessment/submit.ts for
-- the retry-safe orchestration — mirrors
-- src/lib/languageBrain/ingest.ts's pattern closely).
--
-- TRUST: p_raw_score is the one number this function genuinely cannot
-- re-derive without duplicating computeWritingRawScore's
-- criterion-averaging logic a second time in SQL (the same
-- "mirror in TS, not drive from SQL" relationship
-- src/lib/languageBrain/scoring.ts already has with its generated
-- column) — it is range-checked here instead of trusted blindly.
-- items_administered/items_evaluated are NOT accepted as parameters at
-- all: the caller (src/lib/assessment/submit.ts) already only invokes
-- this once it believes every writing response is evaluated, but this
-- function does not take that on faith — it counts the assessment's own
-- persisted writing assessment_responses and writing_evaluations rows
-- itself and REFUSES to complete unless every administered writing
-- response genuinely has a real evaluation. This is a structural
-- backstop against a future bug in submit.ts (or any other trusted
-- caller) that might otherwise finalize with fabricated or incomplete
-- counts.
-- ============================================================
create or replace function public.cefr_v2_finalize_writing_skill(
  p_assessment_id uuid,
  p_user_id uuid,
  p_raw_score numeric
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_target_language_code text;
  v_administered int;
  v_evaluated int;
begin
  select status, target_language_code into v_status, v_target_language_code
    from public.language_assessments
    where id = p_assessment_id and user_id = p_user_id
    for update;

  if v_status is null then
    raise exception 'cefr_v2_finalize_writing_skill: assessment % not found for this user', p_assessment_id;
  end if;

  if v_status is distinct from 'evaluating' then
    return jsonb_build_object('alreadyFinalized', true, 'status', v_status);
  end if;

  if p_raw_score is null or p_raw_score < 0 or p_raw_score > 100 then
    raise exception 'cefr_v2_finalize_writing_skill: raw_score % is out of the 0-100 range', p_raw_score;
  end if;

  -- Database-derived facts, not trusted from the caller: how many writing
  -- items this assessment actually served, and how many of those
  -- responses actually have a real, persisted evaluation.
  select count(*) into v_administered
    from public.assessment_responses r
    join public.assessment_item_versions iv on iv.id = r.item_version_id
    where r.assessment_id = p_assessment_id
      and iv.item_type = 'writing_prompt';

  select count(*) into v_evaluated
    from public.writing_evaluations we
    join public.assessment_responses r on r.id = we.response_id
    join public.assessment_item_versions iv on iv.id = r.item_version_id
    where r.assessment_id = p_assessment_id
      and iv.item_type = 'writing_prompt';

  if v_administered = 0 then
    raise exception 'cefr_v2_finalize_writing_skill: assessment % has no writing responses to finalize', p_assessment_id;
  end if;

  if v_evaluated < v_administered then
    -- Real evidence is still missing for at least one writing response —
    -- never fabricate completion. submit.ts only calls this function once
    -- it believes every pending response is evaluated; this is the
    -- structural guarantee that makes that true rather than a convention.
    raise exception 'cefr_v2_finalize_writing_skill: % of % writing responses for assessment % still lack an evaluation',
      v_administered - v_evaluated, v_administered, p_assessment_id;
  end if;

  insert into public.assessment_skill_results (
    assessment_id, user_id, skill, is_assessed, items_administered, items_correct, raw_score
  ) values (
    p_assessment_id, p_user_id, 'writing', true, v_administered, null, p_raw_score
  )
  on conflict (assessment_id, skill) do nothing;

  insert into public.cefr_skill_states (
    user_id, target_language_code, skill, status, estimated_level, last_assessment_id
  ) values (
    p_user_id, v_target_language_code, 'writing', 'unassessed', null, p_assessment_id
  )
  on conflict (user_id, target_language_code, skill) do nothing;

  update public.language_assessments
    set status = 'completed', completed_at = now()
    where id = p_assessment_id;

  return jsonb_build_object('completed', true, 'itemsEvaluated', v_evaluated);
end;
$$;

revoke all on function public.cefr_v2_finalize_writing_skill(uuid, uuid, numeric)
  from public, authenticated, anon;
grant execute on function public.cefr_v2_finalize_writing_skill(uuid, uuid, numeric)
  to service_role;
