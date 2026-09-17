-- Phase 3 schema: the AI lesson engine's real persistence.
-- Additive only — does not modify 0001_init.sql through
-- 0004_placement_test_version.sql. Same RLS-scoped-to-auth.uid()
-- convention as those, with one deliberate departure explained below.
--
-- SECURITY MODEL (read before touching this file):
-- Server Actions authenticate to Postgres with the SAME publishable-key +
-- user-JWT credential the browser itself holds (see src/lib/supabase/
-- server.ts vs client.ts) — there is no Postgres-level distinction
-- between "our Server Action wrote this" and "a browser called
-- supabase-js directly with its own session." A plain
-- `auth.uid() = user_id` INSERT/UPDATE policy therefore does NOT make
-- writes trusted — it only makes them tenant-isolated. It would let an
-- authenticated browser insert a fabricated `lesson_messages` row with
-- role = 'teacher', mark its own session 'completed', overwrite
-- `summary`, or rewrite its own snapshot fields (teacher/language/CEFR)
-- after creation, all indistinguishable from real server-generated data
-- to any later reader (including a future Language Brain).
--
-- Fix: `authenticated`/`anon` get NO insert/update grant on either table
-- at all — not "no policy for it," an actual REVOKE, so a future
-- permissive policy added by mistake still can't reach these tables.
-- All writes go through `service_role` (src/lib/supabase/serviceRole.ts),
-- used only inside src/features/lessons/actions.ts, which already
-- derives every user_id from a server-verified session and never from
-- client input — that application-level check is what now stands in
-- for the RLS write-check this table no longer has. Triggers below add a
-- structural backstop (snapshot immutability, a fixed status state
-- machine, and message append-only-ness) that holds even against that
-- trusted code, since triggers fire regardless of RLS/BYPASSRLS.

-- lesson_sessions: one row per lesson attempt. Context (target/native
-- language, CEFR, goal, teacher) is a SNAPSHOT taken at creation time,
-- not a live join back to profiles/user_languages — so a lesson stays
-- internally consistent even if the learner's settings change later,
-- the same reasoning as placement_test_attempts.test_version snapshotting
-- which bank produced a result.
create table if not exists public.lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language_code text not null,
  native_language_code text not null,
  -- Nullable on purpose: a learner with no assessed CEFR level takes an
  -- honestly-unassessed, beginner-safe lesson (see src/lib/lessons/prompt.ts)
  -- rather than an invented level. Never write a fabricated value here.
  cefr_level text,
  learning_goal text not null,
  teacher_id text not null,
  -- No CHECK on mode: future phases add lesson modes (business, career,
  -- kids, ...) regularly, so pinning this to a CHECK list would need a
  -- migration on every new mode. The app-level Zod enum in
  -- src/lib/lessons/schemas.ts is the live gate; only 'general' is valid
  -- for Phase 3.
  mode text not null default 'general',
  status text not null default 'active',
  -- Server-owned, e.g. "lesson-v1" — same reasoning as
  -- placement_test_attempts.test_version: no CHECK, because prompt
  -- versions are expected to change as the prompt is revised, and the
  -- version on old rows should stay a true record of what generated
  -- them either way.
  prompt_version text not null,
  -- Populated once, only at completion, by a dedicated Zod-validated
  -- summary generation step — never partially/speculatively written.
  summary jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lesson_sessions
  add constraint lesson_sessions_cefr_level_check
    check (cefr_level is null or cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

alter table public.lesson_sessions
  add constraint lesson_sessions_teacher_id_check
    check (teacher_id in ('anna', 'james', 'sofia', 'alex', 'mary'));

-- status is a small, genuinely stable set (unlike mode/prompt_version
-- above) — a CHECK constraint is appropriate here.
alter table public.lesson_sessions
  add constraint lesson_sessions_status_check
    check (status in ('active', 'completed', 'abandoned'));

alter table public.lesson_sessions enable row level security;

create policy "Users can view their own lesson sessions"
  on public.lesson_sessions for select
  using (auth.uid() = user_id);

-- Deliberately NO insert/update policy for authenticated/anon: every
-- write to this table happens through service_role (see the header
-- comment). Adding a policy here without also re-litigating the header
-- comment's threat model would silently reopen the hole this migration
-- exists to close.

revoke insert, update, delete on public.lesson_sessions from authenticated, anon;

-- Deliberately no delete policy/grant either: a lesson session is a
-- historical record once created, same reasoning as
-- profiles/placement_test_attempts.

create index if not exists lesson_sessions_user_id_idx
  on public.lesson_sessions (user_id);

-- Reuses the existing set_updated_at() trigger function from
-- 0001_init.sql rather than defining a new one.
create trigger lesson_sessions_set_updated_at
  before update on public.lesson_sessions
  for each row execute function public.set_updated_at();

-- Structural backstop, enforced for EVERY writer including service_role
-- (triggers are not skipped by RLS bypass): snapshot fields are
-- immutable after creation, and status may only move active -> completed
-- or active -> abandoned, never anywhere else. This holds even if a
-- future bug in the trusted Server Action code tried to do otherwise.
create or replace function public.lesson_sessions_protect_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.target_language_code is distinct from old.target_language_code
    or new.native_language_code is distinct from old.native_language_code
    or new.cefr_level is distinct from old.cefr_level
    or new.learning_goal is distinct from old.learning_goal
    or new.teacher_id is distinct from old.teacher_id
    or new.mode is distinct from old.mode
    or new.prompt_version is distinct from old.prompt_version
    or new.started_at is distinct from old.started_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'lesson_sessions snapshot fields are immutable after creation';
  end if;

  if new.status is distinct from old.status
    and not (old.status = 'active' and new.status in ('completed', 'abandoned'))
  then
    raise exception 'invalid lesson_sessions status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

create trigger lesson_sessions_protect_snapshot_trigger
  before update on public.lesson_sessions
  for each row execute function public.lesson_sessions_protect_snapshot();

-- lesson_messages: one row per teacher/learner turn. Immutable once
-- written — a message is a historical fact, never edited after the fact.
create table if not exists public.lesson_messages (
  id uuid primary key default gen_random_uuid(),
  lesson_session_id uuid not null references public.lesson_sessions (id) on delete cascade,
  -- Denormalized owner id, duplicated from lesson_sessions.user_id
  -- rather than requiring a join to check ownership. This keeps every
  -- RLS policy here a simple, fast, robust `auth.uid() = user_id` check,
  -- the same shape as every other RLS policy in this schema, instead of
  -- a subquery into lesson_sessions.
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  content text not null,
  -- For teacher turns, holds the rest of the validated structured AI
  -- response (correction, lessonState) alongside the plain-text content,
  -- so the UI never has to re-parse content as JSON. Never holds a raw,
  -- unvalidated AI response — only what already passed Zod validation.
  metadata jsonb,
  -- Idempotency key for learner turns only: the client generates one
  -- UUID per submit attempt. The unique constraint below means a
  -- retried submission with the same key hits a constraint violation
  -- instead of creating a duplicate row — durable and correct across
  -- server instances, unlike an in-memory dedupe check.
  client_turn_id text,
  created_at timestamptz not null default now()
);

alter table public.lesson_messages
  add constraint lesson_messages_role_check
    check (role in ('teacher', 'learner'));
-- No 'system' role: the system prompt is rebuilt fresh, server-side, on
-- every AI call from trusted context (see src/lib/lessons/prompt.ts) and
-- is never persisted as a row in this table — so it can't be exposed as
-- a normal, client-readable message, because it never becomes one.
-- The role CHECK alone does not stop a browser from writing role =
-- 'teacher' directly — that's the grant revocation below, not this.

alter table public.lesson_messages enable row level security;

create policy "Users can view their own lesson messages"
  on public.lesson_messages for select
  using (auth.uid() = user_id);

-- Deliberately NO insert/update/delete policy for authenticated/anon:
-- every write (including the LEARNER's own message) happens through
-- service_role. This is what stops a browser from inserting a
-- role = 'teacher' row directly — no policy/grant combination lets it
-- reach this table for writes at all, regardless of the role value it
-- would try to set.

revoke insert, update, delete on public.lesson_messages from authenticated, anon;

create unique index if not exists lesson_messages_session_turn_idx
  on public.lesson_messages (lesson_session_id, client_turn_id)
  where client_turn_id is not null;

create index if not exists lesson_messages_session_created_idx
  on public.lesson_messages (lesson_session_id, created_at);

create index if not exists lesson_messages_user_id_idx
  on public.lesson_messages (user_id);

-- Structural backstop: messages are append-only for EVERY writer,
-- including service_role — once written, a message can never be changed
-- or removed by anyone, not even our own trusted server code.
create or replace function public.lesson_messages_prevent_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'lesson_messages rows are immutable once written';
end;
$$;

create trigger lesson_messages_prevent_update
  before update on public.lesson_messages
  for each row execute function public.lesson_messages_prevent_mutation();

create trigger lesson_messages_prevent_delete
  before delete on public.lesson_messages
  for each row execute function public.lesson_messages_prevent_mutation();
