-- Phase 1 schema foundation: profiles + user_languages.
-- Every table enforces Row Level Security scoped to auth.uid() — no broad
-- public policies. Run this in the Supabase SQL editor, or via
-- `supabase db push` if you use the Supabase CLI.

-- profiles: one application profile per authenticated user.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Deliberately no delete policy: a profile row should only ever disappear
-- as a side effect of deleting the auth.users row (which cascades), never
-- via direct self-service delete that would leave an authenticated user
-- with no profile.

-- user_languages: a user's target languages and CEFR progress.
create table if not exists public.user_languages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language_code text not null,
  current_cefr_level text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_language_code)
);

alter table public.user_languages enable row level security;

-- Postgres does not auto-index foreign key columns. Every RLS policy below
-- filters on user_id, so an explicit index keeps that from becoming a
-- sequential scan as the table grows.
create index if not exists user_languages_user_id_idx
  on public.user_languages (user_id);

create policy "Users can view their own languages"
  on public.user_languages for select
  using (auth.uid() = user_id);

create policy "Users can insert their own languages"
  on public.user_languages for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own languages"
  on public.user_languages for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own languages"
  on public.user_languages for delete
  using (auth.uid() = user_id);

-- Keep updated_at current on every row update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger user_languages_set_updated_at
  before update on public.user_languages
  for each row execute function public.set_updated_at();

-- Automatically create a profile row when a new auth user signs up.
-- security definer is scoped tightly: it only ever inserts a row keyed to
-- the id of the user that was just created by Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
