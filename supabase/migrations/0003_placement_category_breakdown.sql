-- Phase 2 follow-up: per-category breakdown for the level-result screen's
-- "Estimated focus" display (vocabulary/grammar/reading percentages).
-- Additive only — run after 0002_onboarding.sql (placement_test_attempts
-- must already exist), regardless of whether 0002 was already applied.

alter table public.placement_test_attempts
  add column if not exists category_breakdown jsonb;

-- No RLS change needed: the existing select/insert policies on
-- placement_test_attempts are row-scoped and already cover this column.
-- No check constraint on the JSON shape — this value is always computed
-- server-side from validated placement answers (src/lib/placement/scoring.ts),
-- never taken from client input directly.
