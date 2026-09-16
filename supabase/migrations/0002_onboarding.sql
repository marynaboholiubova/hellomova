-- Phase 2 schema: onboarding fields on profiles + placement test attempts.
-- Same conventions as 0001_init.sql: RLS scoped to auth.uid(), no broad
-- public policies, no service-role usage. Does not modify 0001_init.sql.

-- profiles: onboarding progress + collected onboarding answers.
alter table public.profiles
  add column if not exists native_language_code text,
  add column if not exists learning_goal text,
  add column if not exists selected_teacher_id text,
  add column if not exists onboarding_step text not null default 'native-language',
  add column if not exists onboarding_completed_at timestamptz;

-- Enum-shaped columns get a check constraint too, not just app-level Zod
-- validation — defense in depth for "no unvalidated values" at the data
-- layer. These lists match src/constants/{goals,teachers}.ts and
-- src/lib/onboarding/dal.ts exactly; update all three together.
alter table public.profiles
  add constraint profiles_learning_goal_check
    check (learning_goal is null or learning_goal in (
      'general', 'travel', 'work', 'business', 'job_interview', 'study', 'relocation'
    ));

alter table public.profiles
  add constraint profiles_selected_teacher_id_check
    check (selected_teacher_id is null or selected_teacher_id in (
      'anna', 'james', 'sofia', 'alex', 'mary'
    ));

alter table public.profiles
  add constraint profiles_onboarding_step_check
    check (onboarding_step in (
      'native-language', 'target-language', 'goal', 'placement-test',
      'result', 'personal-plan', 'teacher', 'completed'
    ));

-- No RLS changes needed here: profiles' existing select/insert/update
-- policies (0001_init.sql) are row-scoped to auth.uid() = id, which
-- already covers these new columns.

-- placement_test_attempts: an immutable record of each deterministic
-- placement test run, kept separate from user_languages.current_cefr_level
-- (the denormalized "current" result) so later phases have real history to
-- build adaptive/AI scoring on top of.
create table if not exists public.placement_test_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language_code text not null,
  score int not null,
  total_questions int not null,
  estimated_level text not null check (estimated_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  created_at timestamptz not null default now()
);

alter table public.placement_test_attempts enable row level security;

create policy "Users can view their own placement attempts"
  on public.placement_test_attempts for select
  using (auth.uid() = user_id);

create policy "Users can insert their own placement attempts"
  on public.placement_test_attempts for insert
  with check (auth.uid() = user_id);

-- Deliberately no update/delete policy: an attempt is an immutable
-- historical record, same reasoning as profiles having no delete policy.

create index if not exists placement_test_attempts_user_id_idx
  on public.placement_test_attempts (user_id);

-- user_languages.current_cefr_level was left as unconstrained text in
-- 0001_init.sql (no CEFR-writing code existed yet). Phase 2 is the first
-- code path that writes it, so constrain it now.
alter table public.user_languages
  add constraint user_languages_current_cefr_level_check
    check (current_cefr_level is null or current_cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

-- target_language_code intentionally has no check constraint yet: the
-- launch language catalog (src/constants/languages.ts) is still a
-- placeholder pending the real ~50-language list. Add a matching check
-- constraint in a follow-up migration once that list is final — app-level
-- Zod validation is the authoritative gate against the catalog until then.
