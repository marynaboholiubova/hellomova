-- Phase 8 schema: Pronunciation / Mary — a real, audio-evidenced
-- pronunciation-practice attempt log. Additive only — does not modify
-- 0001_init.sql through 0008_cefr_v2_mixed_band_state_fix.sql.
--
-- ONE flat table, not a session+attempt split: there is no real
-- aggregate "session" concept here (no session-level status, no
-- session-level data beyond what each attempt already owns), so this
-- follows this repo's placement_test_attempts precedent (one row per
-- real attempt) rather than inventing a grouping table with no genuine
-- need — see AGENTS.md's "Pronunciation / Mary" section for the full
-- architecture this table serves.
--
-- SECURITY MODEL (same threat model as 0005_ai_lesson_engine.sql — read
-- that file's header first if this is new to you):
-- Server Actions authenticate to Postgres with the SAME publishable-key +
-- user-JWT credential the browser itself holds. A plain
-- `auth.uid() = user_id` INSERT/UPDATE policy would NOT make writes
-- trusted — it would let an authenticated browser insert a fabricated
-- `pronunciation_attempts` row with a fake `transcript`/`evaluation`/
-- `status = 'completed'`, indistinguishable from a real provider-derived
-- result to any later reader (including a future Language Brain
-- integration). Fix: `authenticated`/`anon` get NO insert/update grant on
-- this table at all — not "no policy for it," an actual REVOKE. All
-- writes go through `service_role` (src/lib/supabase/serviceRole.ts),
-- used only inside src/features/pronunciation/actions.ts, which derives
-- `user_id` from a server-verified session and never from client input.
-- A trigger below adds a structural backstop (snapshot immutability, a
-- fixed one-shot status state machine) that holds even against that
-- trusted code, since triggers fire regardless of service_role's RLS
-- bypass.

-- pronunciation_attempts: one row per real pronunciation-practice
-- attempt. `target_text` is server-generated and set at creation — the
-- row never exists without it, so there is no "unprompted" attempt.
-- Snapshot fields (language/level/target text/prompt_version) are fixed
-- at creation, same reasoning as lesson_sessions' snapshot: a result
-- stays interpretable even if the learner's live profile changes later.
create table if not exists public.pronunciation_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language_code text not null,
  native_language_code text not null,
  -- Nullable on purpose, same rule as lesson_sessions.cefr_level: a
  -- learner with no assessed level gets an honestly-unassessed,
  -- beginner-safe target phrase rather than an invented level.
  cefr_level text,
  target_text text not null,
  -- Server-owned, e.g. "pronunciation-v1" — same reasoning as
  -- lesson_sessions.prompt_version / placement's test_version: no CHECK,
  -- because this is expected to change as the phrase-generation and
  -- evaluation prompts are revised, and old rows should stay a true
  -- record of what generated them either way.
  prompt_version text not null,
  -- 'pending' | 'completed' | 'failed' — a one-shot machine: a row is
  -- created 'pending' (phrase generated, audio not yet submitted) and
  -- transitions exactly once, to a terminal state, when the learner's
  -- audio is processed. There is no 'transcribing'/'evaluating'
  -- intermediate DB state because the whole pipeline (transcribe then
  -- evaluate) runs synchronously inside one server action call before
  -- the row is ever updated — same shape as a lesson turn's single AI
  -- round-trip, not a long-running background job.
  status text not null default 'pending',
  -- Real transcription evidence from the audio the learner actually
  -- submitted — never invented, never edited after the fact.
  transcript text,
  -- Structured, Zod-validated qualitative feedback (see
  -- src/lib/pronunciation/schemas.ts) — categorical observations, never
  -- a fabricated numeric "accuracy percentage" the underlying provider
  -- cannot actually produce.
  evaluation jsonb,
  -- Provenance (e.g. "whisper-1" / "gpt-4o-mini") — same pattern as
  -- writing_evaluations.ai_model in 0007_cefr_assessment_v2.sql.
  transcription_model text,
  evaluation_model text,
  -- Set only when status = 'failed' — an honest, safe-for-display reason
  -- (never a raw provider error), so a failed attempt is still
  -- interpretable later instead of silently vanishing.
  error_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.pronunciation_attempts
  add constraint pronunciation_attempts_status_check
    check (status in ('pending', 'completed', 'failed'));

alter table public.pronunciation_attempts
  add constraint pronunciation_attempts_cefr_level_check
    check (cefr_level is null or cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

-- Structural, not just conventional: a 'pending' row can never already
-- carry a result, and a terminal row can never be missing the fields its
-- own status implies.
alter table public.pronunciation_attempts
  add constraint pronunciation_attempts_status_consistency_check
    check (
      (status = 'pending' and transcript is null and evaluation is null and completed_at is null and error_reason is null) or
      (status = 'completed' and evaluation is not null and completed_at is not null and error_reason is null) or
      (status = 'failed' and completed_at is not null and error_reason is not null)
    );

alter table public.pronunciation_attempts enable row level security;

create policy "Users can view their own pronunciation attempts"
  on public.pronunciation_attempts for select
  using (auth.uid() = user_id);

-- Explicit revoke, not just "no policy" — see header comment. No delete
-- policy either: like lesson_sessions/lesson_messages, a pronunciation
-- attempt is a permanent historical record once it exists.
revoke insert, update, delete on public.pronunciation_attempts from authenticated, anon;

create index if not exists pronunciation_attempts_user_lang_idx
  on public.pronunciation_attempts (user_id, target_language_code, created_at desc);

-- Snapshot immutability + one-shot forward-only status machine — holds
-- even against service_role, the same reasoning as
-- lesson_sessions_protect_snapshot_trigger in 0005_ai_lesson_engine.sql.
create or replace function public.pronunciation_attempts_protect_lifecycle()
returns trigger
language plpgsql
as $$
begin
  -- A terminal row (completed/failed) is permanently frozen — not even
  -- a second legitimate-looking transition is allowed.
  if old.status is distinct from 'pending' then
    raise exception 'pronunciation_attempts: row is already terminal (%) and cannot be modified', old.status;
  end if;

  if new.user_id is distinct from old.user_id
    or new.target_language_code is distinct from old.target_language_code
    or new.native_language_code is distinct from old.native_language_code
    or new.cefr_level is distinct from old.cefr_level
    or new.target_text is distinct from old.target_text
    or new.prompt_version is distinct from old.prompt_version
    or new.created_at is distinct from old.created_at
  then
    raise exception 'pronunciation_attempts snapshot fields are immutable after creation';
  end if;

  if new.status is distinct from 'completed' and new.status is distinct from 'pending' and new.status is distinct from 'failed' then
    raise exception 'pronunciation_attempts: invalid status %', new.status;
  end if;

  if new.status = 'pending' then
    raise exception 'pronunciation_attempts: cannot update a row and leave it pending — the only legal transitions are pending -> completed and pending -> failed';
  end if;

  return new;
end;
$$;

create trigger pronunciation_attempts_protect_lifecycle_trigger
  before update on public.pronunciation_attempts
  for each row execute function public.pronunciation_attempts_protect_lifecycle();

-- No explicit grant to service_role needed — same as lesson_sessions/
-- lesson_messages in 0005_ai_lesson_engine.sql: service_role bypasses RLS
-- (and the revoke above) via Supabase's BYPASSRLS role attribute, not via
-- a table grant. Writes go through src/features/pronunciation/actions.ts
-- only, using createServiceRoleClient().
