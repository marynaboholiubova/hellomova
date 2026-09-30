-- Phase 5 hotfix: cefr_v2_submit_assessment wrote an invalid
-- cefr_skill_states row for mixed-CEFR-band evidence. Additive-only
-- CREATE OR REPLACE of exactly one function — does not touch any table,
-- trigger, policy, grant, or other function from 0001_init.sql through
-- 0007_cefr_assessment_v2.sql. 0007 has already been applied to a real
-- project; this migration is the actual production fix and must be
-- applied there, in order, after 0007.
--
-- ============================================================
-- ROOT CAUSE (found by supabase/verify_0007_cefr_assessment_v2.sql's
-- mixed-CEFR-band test against a live database — 0007's own local
-- source, static review, and Vitest could not catch this, because it is
-- a real Postgres CHECK-constraint interaction, not application logic)
-- ============================================================
-- 0007's cefr_v2_submit_assessment computed `v_estimated_level` as NULL
-- for a skill whose answered items in one attempt span more than one
-- CEFR band (the correct, honest behavior — see 0007's "MIXED-BAND
-- HONESTY" comment) and then unconditionally executed:
--
--   insert into cefr_skill_states (..., status, estimated_level, ...)
--   values (..., 'estimated', v_estimated_level, ...)
--   on conflict (...) do update set ... where excluded.estimated_level is not null;
--
-- The `where excluded.estimated_level is not null` clause only governs
-- whether the ON CONFLICT *UPDATE* branch applies — it cannot rescue an
-- INSERT whose OWN row values are already invalid. When no conflicting
-- row exists yet (or even when one does — the invalid row is still
-- constructed before Postgres decides which branch to take),
-- `('estimated', NULL)` is checked against
-- `cefr_skill_states_status_level_consistency_check`
-- (`status = 'estimated' and estimated_level is not null`) and Postgres
-- rejects the entire statement with 23514 before ANY branch resolution
-- happens. This made every mixed-band attempt error out inside
-- `cefr_v2_submit_assessment`, mid-transaction, for a real assessment
-- that had already been legitimately submitted.
--
-- ============================================================
-- FIX
-- ============================================================
-- The cefr_skill_states insert/upsert now only ever executes when
-- `v_estimated_level is not null` — i.e., exactly when the row it would
-- write is valid per the existing CHECK constraint. When a skill's
-- evidence is mixed-band (or single-band but failing the pass
-- threshold), this migration's function skips the cefr_skill_states
-- write for that skill ENTIRELY, which means:
--   - A learner with no prior cumulative state for that skill simply
--     gets no row for it this round — never an invalid one, never a
--     guessed one.
--   - A learner with an existing valid cumulative estimate (e.g.
--     estimated B1 from an earlier attempt) keeps that exact row
--     untouched — unresolved mixed-band evidence from a LATER attempt
--     can never erase or downgrade an earlier valid estimate, because
--     the write that would touch that row never happens at all.
-- assessment_skill_results — the per-ATTEMPT evidence record — is
-- completely unaffected by this fix and still unconditionally records
-- items_administered/items_correct/raw_score/estimated_level (including
-- a null estimated_level for mixed-band evidence) for every skill in
-- every attempt; only the CUMULATIVE cefr_skill_states write is guarded.
-- This is exactly the distinction AGENTS.md's "no simple average" and
-- "never fabricate/erase evidence" principles already require — this
-- migration does not change that policy, it fixes a bug that violated
-- it under one specific input shape.
--
-- Everything else about this function is unchanged: signature
-- (uuid, uuid) -> jsonb, service_role-only EXECUTE grant, search_path,
-- idempotent status-guard (`alreadySubmitted` replay), the `for update`
-- row lock, the assessment lifecycle transitions, and the writing-path
-- branch (pendingWritingResponseIds / completed).
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
    -- deterministic and order-independent, unlike a `limit 1` row pick.
    v_estimated_level := case
      when v_skill_row.distinct_bands = 1
           and v_skill_row.correct::numeric / v_skill_row.administered >= (2.0 / 3.0)
      then v_skill_row.single_band
      else null
    end;

    -- assessment_skill_results ALWAYS records this attempt's real
    -- evidence for this skill, regardless of whether a single level
    -- could be honestly resolved — never gated on v_estimated_level.
    insert into public.assessment_skill_results (
      assessment_id, user_id, skill, is_assessed, items_administered, items_correct, raw_score, estimated_level
    ) values (
      p_assessment_id, p_user_id, v_skill_row.skill, true, v_skill_row.administered, v_skill_row.correct,
      round(100.0 * v_skill_row.correct / v_skill_row.administered, 2), v_estimated_level
    )
    on conflict (assessment_id, skill) do nothing;

    -- cefr_skill_states is the learner's CUMULATIVE profile — only ever
    -- written when this attempt resolved a real, single-band, passing
    -- level. Skipping this write entirely when v_estimated_level is null
    -- (mixed-band, or single-band but failing the pass threshold) is
    -- what prevents 23514 (a row claiming 'estimated' with a null level
    -- can never satisfy cefr_skill_states_status_level_consistency_check)
    -- AND is what protects a prior valid cumulative estimate from being
    -- erased/downgraded by this attempt's unresolved evidence — an
    -- existing row for this (user, language, skill) is left completely
    -- untouched when this block does not run.
    if v_estimated_level is not null then
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
    end if;
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

-- Re-asserted, not new: CREATE OR REPLACE FUNCTION preserves an existing
-- function's privileges when the signature is unchanged, so this is
-- technically redundant against an already-patched database — but it
-- keeps this migration self-contained and correct to run standalone
-- (e.g. against a fresh database that only ever had 0001-0007 applied,
-- where 0007's original definition is still in place until 0008 runs).
revoke all on function public.cefr_v2_submit_assessment(uuid, uuid)
  from public, authenticated, anon;
grant execute on function public.cefr_v2_submit_assessment(uuid, uuid)
  to service_role;
