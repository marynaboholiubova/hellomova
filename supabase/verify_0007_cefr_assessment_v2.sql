-- ============================================================
-- HELLOMOVA — CEFR ASSESSMENT V2
-- LIVE DATABASE VERIFICATION FOR MIGRATIONS 0007 + 0008
--
-- SAFE:
-- Everything is executed inside one transaction.
-- Final ROLLBACK removes all temporary test rows/changes.
--
-- DO NOT REMOVE THE FINAL ROLLBACK.
--
-- Prerequisite: BOTH 0007_cefr_assessment_v2.sql AND
-- 0008_cefr_v2_mixed_band_state_fix.sql must already be applied to the
-- target database (this script only verifies them — it creates no
-- schema of its own). Section 12 (mixed-CEFR-band evidence) and sections
-- 15-17 (added for 0008) will fail with a 23514 check-constraint
-- violation on cefr_skill_states if only 0007 is applied — that failure
-- is exactly the real bug 0008 fixes, caught by an earlier run of this
-- same script against a live project. Run this by pasting it into the
-- Supabase SQL editor for the project you applied 0007+0008 to, or via
-- `psql`/any client with a direct Postgres connection. It cannot be run
-- through the REST/PostgREST API (no arbitrary multi-statement SQL, SET
-- ROLE, or transactions there) — this is why it was never executed as
-- part of the automated review that produced it; see the Phase 5
-- hardening report for details.
--
-- Sections 12 and 15-17 use a synthetic target_language_code ('zz',
-- never a real launch-catalog code — assessment_items.target_language_code
-- has no CHECK/FK tying it to the real catalog) so their preconditions
-- ("no prior cumulative state" / "an existing B1 estimate") are
-- deterministic and never collide with the real test user's actual
-- production cefr_skill_states rows.
-- ============================================================

begin;

set local statement_timeout = '30s';


-- ============================================================
-- 0. PREFLIGHT
-- ============================================================

do $$
begin
  if not exists (select 1 from auth.users) then
    raise exception
      'PRECHECK FAILED: auth.users contains no user. A real existing test user is required.';
  end if;

  if not exists (select 1 from public.user_languages) then
    raise exception
      'PRECHECK FAILED: public.user_languages contains no row. Complete onboarding for at least one test user first.';
  end if;

  raise notice 'PASS 0: preflight — auth user and user_languages row exist';
end;
$$;


-- ============================================================
-- 1. EFFECTIVE user_languages PRIVILEGES
-- ============================================================

do $$
begin
  -- Broad table-level writes MUST be gone.
  if has_table_privilege(
    'authenticated',
    'public.user_languages',
    'INSERT'
  ) then
    raise exception
      'SECURITY FAIL: authenticated still has table-level INSERT on user_languages';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.user_languages',
    'UPDATE'
  ) then
    raise exception
      'SECURITY FAIL: authenticated still has table-level UPDATE on user_languages';
  end if;


  -- Legitimate INSERT columns.
  if not has_column_privilege(
    'authenticated',
    'public.user_languages',
    'user_id',
    'INSERT'
  ) then
    raise exception 'SECURITY FAIL: INSERT user_id privilege missing';
  end if;

  if not has_column_privilege(
    'authenticated',
    'public.user_languages',
    'target_language_code',
    'INSERT'
  ) then
    raise exception 'SECURITY FAIL: INSERT target_language_code privilege missing';
  end if;

  if not has_column_privilege(
    'authenticated',
    'public.user_languages',
    'is_primary',
    'INSERT'
  ) then
    raise exception 'SECURITY FAIL: INSERT is_primary privilege missing';
  end if;


  -- Legitimate UPDATE columns.
  if not has_column_privilege(
    'authenticated',
    'public.user_languages',
    'user_id',
    'UPDATE'
  ) then
    raise exception 'SECURITY FAIL: UPDATE user_id privilege missing';
  end if;

  if not has_column_privilege(
    'authenticated',
    'public.user_languages',
    'target_language_code',
    'UPDATE'
  ) then
    raise exception 'SECURITY FAIL: UPDATE target_language_code privilege missing';
  end if;

  if not has_column_privilege(
    'authenticated',
    'public.user_languages',
    'is_primary',
    'UPDATE'
  ) then
    raise exception 'SECURITY FAIL: UPDATE is_primary privilege missing';
  end if;

  if not has_column_privilege(
    'authenticated',
    'public.user_languages',
    'current_cefr_level',
    'UPDATE'
  ) then
    raise exception 'SECURITY FAIL: UPDATE current_cefr_level privilege missing';
  end if;


  -- Trusted CEFR v2 columns MUST NOT be writable.
  if has_column_privilege(
    'authenticated',
    'public.user_languages',
    'confirmed_cefr_level',
    'INSERT'
  )
  or has_column_privilege(
    'authenticated',
    'public.user_languages',
    'confirmed_cefr_level',
    'UPDATE'
  ) then
    raise exception
      'SECURITY FAIL: authenticated can write confirmed_cefr_level';
  end if;

  if has_column_privilege(
    'authenticated',
    'public.user_languages',
    'learning_cefr_level',
    'INSERT'
  )
  or has_column_privilege(
    'authenticated',
    'public.user_languages',
    'learning_cefr_level',
    'UPDATE'
  ) then
    raise exception
      'SECURITY FAIL: authenticated can write learning_cefr_level';
  end if;

  if has_column_privilege(
    'authenticated',
    'public.user_languages',
    'assessment_status',
    'INSERT'
  )
  or has_column_privilege(
    'authenticated',
    'public.user_languages',
    'assessment_status',
    'UPDATE'
  ) then
    raise exception
      'SECURITY FAIL: authenticated can write assessment_status';
  end if;

  raise notice 'PASS 1: user_languages effective privileges are correct';
end;
$$;


-- ============================================================
-- 2. RPC EXPOSURE
-- authenticated must NOT execute trusted write RPCs.
-- service_role MUST be able to execute them.
-- ============================================================

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.cefr_v2_create_assessment(uuid,text,text,text,uuid[])',
    'EXECUTE'
  ) then
    raise exception
      'SECURITY FAIL: authenticated can execute cefr_v2_create_assessment';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.cefr_v2_record_response(uuid,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception
      'SECURITY FAIL: authenticated can execute cefr_v2_record_response';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.cefr_v2_submit_assessment(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'SECURITY FAIL: authenticated can execute cefr_v2_submit_assessment';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.cefr_v2_finalize_writing_skill(uuid,uuid,numeric)',
    'EXECUTE'
  ) then
    raise exception
      'SECURITY FAIL: authenticated can execute cefr_v2_finalize_writing_skill';
  end if;


  if not has_function_privilege(
    'service_role',
    'public.cefr_v2_create_assessment(uuid,text,text,text,uuid[])',
    'EXECUTE'
  ) then
    raise exception
      'SECURITY FAIL: service_role cannot execute cefr_v2_create_assessment';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.cefr_v2_record_response(uuid,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception
      'SECURITY FAIL: service_role cannot execute cefr_v2_record_response';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.cefr_v2_submit_assessment(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'SECURITY FAIL: service_role cannot execute cefr_v2_submit_assessment';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.cefr_v2_finalize_writing_skill(uuid,uuid,numeric)',
    'EXECUTE'
  ) then
    raise exception
      'SECURITY FAIL: service_role cannot execute cefr_v2_finalize_writing_skill';
  end if;

  raise notice 'PASS 2: trusted RPC execute privileges are correct';
end;
$$;


-- ============================================================
-- 3. REAL AUTHENTICATED user_languages WRITE TEST
--
-- Impersonate an existing user via JWT claims + authenticated role.
-- Legitimate legacy writes must still work.
-- Trusted CEFR columns must fail with privilege errors.
-- ============================================================

-- perform (not select) so no result row is emitted to the SQL editor —
-- set_config's transaction-local (is_local = true) behavior is unchanged,
-- since a plain `do` block (no EXCEPTION clause) does not open its own
-- subtransaction and runs in the same transaction as the surrounding
-- script.
do $$
begin
  perform set_config(
    'request.jwt.claim.sub',
    (
      select user_id::text
      from public.user_languages
      order by created_at nulls last
      limit 1
    ),
    true
  );

  perform set_config(
    'request.jwt.claims',
    (
      select jsonb_build_object(
        'sub', user_id,
        'role', 'authenticated'
      )::text
      from public.user_languages
      order by created_at nulls last
      limit 1
    ),
    true
  );
end;
$$;

set local role authenticated;


do $$
declare
  v_user uuid := auth.uid();
  v_language text;
  v_is_primary boolean;
begin
  if v_user is null then
    raise exception
      'SECURITY TEST FAILED: auth.uid() is NULL while impersonating authenticated user';
  end if;

  select target_language_code, is_primary
    into v_language, v_is_primary
  from public.user_languages
  where user_id = v_user
  order by created_at nulls last
  limit 1;

  if v_language is null then
    raise exception
      'SECURITY TEST FAILED: impersonated user has no user_languages row';
  end if;


  -- Legitimate UPDATE must still work.
  update public.user_languages
  set is_primary = is_primary
  where user_id = v_user
    and target_language_code = v_language;

  update public.user_languages
  set current_cefr_level = current_cefr_level
  where user_id = v_user
    and target_language_code = v_language;


  -- Real onboarding-shaped UPSERT must still work.
  insert into public.user_languages (
    user_id,
    target_language_code,
    is_primary
  )
  values (
    v_user,
    v_language,
    v_is_primary
  )
  on conflict (user_id, target_language_code)
  do update set
    user_id = excluded.user_id,
    target_language_code = excluded.target_language_code,
    is_primary = excluded.is_primary;


  -- confirmed_cefr_level MUST fail.
  begin
    update public.user_languages
    set confirmed_cefr_level = 'C2'
    where user_id = v_user
      and target_language_code = v_language;

    raise exception
      'VERIFY_FAIL: browser was able to UPDATE confirmed_cefr_level';
  exception
    when insufficient_privilege then
      raise notice 'PASS 3A: authenticated cannot UPDATE confirmed_cefr_level';
  end;


  -- learning_cefr_level MUST fail.
  begin
    update public.user_languages
    set learning_cefr_level = 'C2'
    where user_id = v_user
      and target_language_code = v_language;

    raise exception
      'VERIFY_FAIL: browser was able to UPDATE learning_cefr_level';
  exception
    when insufficient_privilege then
      raise notice 'PASS 3B: authenticated cannot UPDATE learning_cefr_level';
  end;


  -- assessment_status MUST fail.
  begin
    update public.user_languages
    set assessment_status = 'confirmed'
    where user_id = v_user
      and target_language_code = v_language;

    raise exception
      'VERIFY_FAIL: browser was able to UPDATE assessment_status';
  exception
    when insufficient_privilege then
      raise notice 'PASS 3C: authenticated cannot UPDATE assessment_status';
  end;


  -- Smuggling trusted value through INSERT/UPSERT MUST fail.
  begin
    insert into public.user_languages (
      user_id,
      target_language_code,
      is_primary,
      confirmed_cefr_level
    )
    values (
      v_user,
      v_language,
      v_is_primary,
      'C2'
    )
    on conflict (user_id, target_language_code)
    do update set
      is_primary = excluded.is_primary;

    raise exception
      'VERIFY_FAIL: browser was able to smuggle confirmed_cefr_level through INSERT';
  exception
    when insufficient_privilege then
      raise notice 'PASS 3D: authenticated cannot smuggle trusted CEFR data through INSERT';
  end;


  raise notice 'PASS 3: legitimate onboarding writes still work and trusted CEFR writes are blocked';
end;
$$;


reset role;


-- ============================================================
-- 4. CREATE ONE TEST ASSESSMENT FOR RLS VERIFICATION
-- ============================================================

do $$
declare
  v_user uuid;
  v_item uuid;
  v_version uuid;
  v_assessment uuid;
begin
  select id into v_user
  from auth.users
  order by created_at
  limit 1;

  insert into public.assessment_items (
    target_language_code,
    skill,
    cefr_target
  )
  values (
    'en',
    'grammar',
    'B1'
  )
  returning id into v_item;

  insert into public.assessment_item_versions (
    item_id,
    version_number,
    item_type,
    prompt,
    answer_key,
    status
  )
  values (
    v_item,
    1,
    'multiple_choice',
    jsonb_build_object(
      'text', 'HelloMova live verification item',
      'options', jsonb_build_array(
        jsonb_build_object('id', 'a', 'label', 'A'),
        jsonb_build_object('id', 'b', 'label', 'B')
      )
    ),
    jsonb_build_object('correctOptionId', 'a'),
    'active'
  )
  returning id into v_version;

  v_assessment := public.cefr_v2_create_assessment(
    v_user,
    'en',
    'initial_placement',
    null,
    array[v_version]
  );

  perform set_config(
    'hellomova.test_assessment_id',
    v_assessment::text,
    true
  );

  perform set_config(
    'hellomova.test_owner_id',
    v_user::text,
    true
  );

  raise notice 'PASS 4: temporary assessment created for RLS verification';
end;
$$;


-- ============================================================
-- 5. RLS — OWNER CAN READ OWN ASSESSMENT
-- ============================================================

do $$
begin
  perform set_config(
    'request.jwt.claim.sub',
    current_setting('hellomova.test_owner_id'),
    true
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', current_setting('hellomova.test_owner_id'),
      'role', 'authenticated'
    )::text,
    true
  );
end;
$$;

set local role authenticated;


do $$
declare
  v_count int;
begin
  select count(*)
    into v_count
  from public.language_assessments
  where id = current_setting('hellomova.test_assessment_id')::uuid;

  if v_count <> 1 then
    raise exception
      'RLS FAIL: owner cannot SELECT own language_assessment';
  end if;

  select count(*)
    into v_count
  from public.assessment_responses
  where assessment_id = current_setting('hellomova.test_assessment_id')::uuid;

  if v_count <> 1 then
    raise exception
      'RLS FAIL: owner cannot SELECT own assessment_response';
  end if;

  raise notice 'PASS 5: owner RLS read works';
end;
$$;


reset role;


-- ============================================================
-- 6. RLS — DIFFERENT AUTHENTICATED USER CANNOT READ
--
-- We do NOT need to create another auth user.
-- A random UUID is enough to test auth.uid()-scoped RLS.
-- ============================================================

do $$
begin
  perform set_config(
    'request.jwt.claim.sub',
    gen_random_uuid()::text,
    true
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', current_setting('request.jwt.claim.sub'),
      'role', 'authenticated'
    )::text,
    true
  );
end;
$$;

set local role authenticated;


do $$
declare
  v_count int;
begin
  select count(*)
    into v_count
  from public.language_assessments
  where id = current_setting('hellomova.test_assessment_id')::uuid;

  if v_count <> 0 then
    raise exception
      'RLS FAIL: another authenticated identity can read someone else''s assessment';
  end if;

  select count(*)
    into v_count
  from public.assessment_responses
  where assessment_id = current_setting('hellomova.test_assessment_id')::uuid;

  if v_count <> 0 then
    raise exception
      'RLS FAIL: another authenticated identity can read someone else''s assessment responses';
  end if;

  raise notice 'PASS 6: cross-user assessment reads are blocked by RLS';
end;
$$;


reset role;


-- ============================================================
-- 7. CROSS-LANGUAGE ITEM CONTAMINATION MUST BE REJECTED
-- ============================================================

do $$
declare
  v_user uuid;
  v_item uuid;
  v_version uuid;
begin
  select id into v_user
  from auth.users
  order by created_at
  limit 1;

  insert into public.assessment_items (
    target_language_code,
    skill,
    cefr_target
  )
  values (
    'fr',
    'grammar',
    'B1'
  )
  returning id into v_item;

  insert into public.assessment_item_versions (
    item_id,
    version_number,
    item_type,
    prompt,
    answer_key,
    status
  )
  values (
    v_item,
    1,
    'multiple_choice',
    jsonb_build_object(
      'text', 'French item for cross-language verification',
      'options', jsonb_build_array(
        jsonb_build_object('id', 'a', 'label', 'A'),
        jsonb_build_object('id', 'b', 'label', 'B')
      )
    ),
    jsonb_build_object('correctOptionId', 'a'),
    'active'
  )
  returning id into v_version;

  begin
    perform public.cefr_v2_create_assessment(
      v_user,
      'en',
      'initial_placement',
      null,
      array[v_version]
    );

    raise exception
      'VERIFY_FAIL: English assessment accepted a French item';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then
        raise;
      end if;

      if position('belongs to target language' in sqlerrm) = 0 then
        raise;
      end if;

      raise notice 'PASS 7: cross-language item contamination rejected';
  end;
end;
$$;


-- ============================================================
-- 8. ZERO-ITEM ASSESSMENT MUST BE REJECTED
-- ============================================================

do $$
declare
  v_user uuid;
begin
  select id into v_user
  from auth.users
  order by created_at
  limit 1;

  begin
    perform public.cefr_v2_create_assessment(
      v_user,
      'en',
      'initial_placement',
      null,
      '{}'::uuid[]
    );

    raise exception
      'VERIFY_FAIL: zero-item assessment was created';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then
        raise;
      end if;

      if position('must contain at least one item version' in sqlerrm) = 0 then
        raise;
      end if;

      raise notice 'PASS 8: empty assessment rejected';
  end;
end;
$$;


-- ============================================================
-- 9. ASSESSMENT ITEM VERSION IMMUTABILITY
-- ============================================================

do $$
declare
  v_item uuid;
  v_version uuid;
begin
  insert into public.assessment_items (
    target_language_code,
    skill,
    cefr_target
  )
  values (
    'en',
    'vocabulary',
    'A2'
  )
  returning id into v_item;

  insert into public.assessment_item_versions (
    item_id,
    version_number,
    item_type,
    prompt,
    answer_key,
    status
  )
  values (
    v_item,
    1,
    'multiple_choice',
    jsonb_build_object(
      'text', 'Original immutable prompt',
      'options', jsonb_build_array(
        jsonb_build_object('id', 'a', 'label', 'A'),
        jsonb_build_object('id', 'b', 'label', 'B')
      )
    ),
    jsonb_build_object('correctOptionId', 'a'),
    'draft'
  )
  returning id into v_version;

  update public.assessment_item_versions
  set status = 'reviewed'
  where id = v_version;

  update public.assessment_item_versions
  set status = 'active'
  where id = v_version;

  begin
    update public.assessment_item_versions
    set prompt = jsonb_build_object(
      'text',
      'TAMPERED'
    )
    where id = v_version;

    raise exception
      'VERIFY_FAIL: active item version content was mutable';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then
        raise;
      end if;

      if position('immutable' in sqlerrm) = 0 then
        raise;
      end if;

      raise notice 'PASS 9: item-version content is immutable after draft';
  end;
end;
$$;


-- ============================================================
-- 10. WRITING RUBRIC IMMUTABILITY
-- ============================================================

do $$
declare
  v_rubric uuid;
begin
  select id into v_rubric
  from public.writing_rubric_versions
  where status = 'active'
  limit 1;

  if v_rubric is null then
    insert into public.writing_rubric_versions (
      version_label,
      criteria,
      status
    )
    values (
      'live-verification-' || gen_random_uuid()::text,
      jsonb_build_array(
        jsonb_build_object(
          'key', 'task_achievement',
          'label', 'Task achievement',
          'description', 'Live verification criterion'
        )
      ),
      'draft'
    )
    returning id into v_rubric;

    update public.writing_rubric_versions
    set status = 'active'
    where id = v_rubric;
  end if;

  perform set_config(
    'hellomova.test_rubric_id',
    v_rubric::text,
    true
  );

  begin
    update public.writing_rubric_versions
    set criteria = jsonb_build_array(
      jsonb_build_object(
        'key', 'tampered',
        'label', 'Tampered',
        'description', 'Should never persist'
      )
    )
    where id = v_rubric;

    raise exception
      'VERIFY_FAIL: active rubric criteria were mutable';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then
        raise;
      end if;

      if position('immutable' in sqlerrm) = 0 then
        raise;
      end if;

      raise notice 'PASS 10: active writing rubric is immutable';
  end;
end;
$$;


-- ============================================================
-- 11. ASSESSMENT POLICY IMMUTABILITY
-- ============================================================

do $$
declare
  v_policy uuid;
begin
  insert into public.assessment_policy_versions (
    policy_area,
    version_label,
    status,
    rules,
    activated_at
  )
  values (
    'live_verification_' || replace(gen_random_uuid()::text, '-', ''),
    'v1',
    'draft',
    '{}'::jsonb,
    null
  )
  returning id into v_policy;

  update public.assessment_policy_versions
  set
    status = 'active',
    activated_at = now()
  where id = v_policy;

  begin
    update public.assessment_policy_versions
    set rules = '{"tampered": true}'::jsonb
    where id = v_policy;

    raise exception
      'VERIFY_FAIL: active assessment policy rules were mutable';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then
        raise;
      end if;

      if position('immutable' in sqlerrm) = 0 then
        raise;
      end if;

      raise notice 'PASS 11: active assessment policy is immutable';
  end;
end;
$$;


-- ============================================================
-- 12. MIXED CEFR BANDS — regression test for the 0008 bug
--
-- Same skill ('grammar'), synthetic language 'zz' (guaranteed no prior
-- cefr_skill_states row for this user, so this also covers requirement D
-- — "no prior cumulative state + unresolved mixed-band => no row"):
-- B1 item + B2 item, both correct.
--
-- Expected:
-- assessment_skill_results.raw_score = 100
-- assessment_skill_results.estimated_level = NULL
-- NO cefr_skill_states row is created at all for (user, 'zz', 'grammar')
--   — before 0008, this INSERT attempt raised 23514
--   (cefr_skill_states_status_level_consistency_check) instead.
--
-- No arbitrary LIMIT 1 / row-order level selection.
-- ============================================================

do $$
declare
  v_user uuid;

  v_item_b1 uuid;
  v_item_b2 uuid;

  v_version_b1 uuid;
  v_version_b2 uuid;

  v_assessment uuid;
  v_response uuid;

  v_result_level text;
  v_raw_score numeric;
  v_result_count int;
  v_skill_state_count int;

  v_submit jsonb;
  v_submit_again jsonb;
begin
  select id into v_user
  from auth.users
  order by created_at
  limit 1;

  if exists (
    select 1 from public.cefr_skill_states
    where user_id = v_user and target_language_code = 'zz' and skill = 'grammar'
  ) then
    raise exception
      'VERIFY_FAIL: precondition violated — a cefr_skill_states row already exists for (user, zz, grammar)';
  end if;


  -- B1
  insert into public.assessment_items (
    target_language_code,
    skill,
    cefr_target
  )
  values (
    'zz',
    'grammar',
    'B1'
  )
  returning id into v_item_b1;

  insert into public.assessment_item_versions (
    item_id,
    version_number,
    item_type,
    prompt,
    answer_key,
    status
  )
  values (
    v_item_b1,
    1,
    'multiple_choice',
    jsonb_build_object(
      'text', 'Mixed-band B1',
      'options', jsonb_build_array(
        jsonb_build_object('id', 'a', 'label', 'Correct'),
        jsonb_build_object('id', 'b', 'label', 'Wrong')
      )
    ),
    jsonb_build_object('correctOptionId', 'a'),
    'active'
  )
  returning id into v_version_b1;


  -- B2
  insert into public.assessment_items (
    target_language_code,
    skill,
    cefr_target
  )
  values (
    'zz',
    'grammar',
    'B2'
  )
  returning id into v_item_b2;

  insert into public.assessment_item_versions (
    item_id,
    version_number,
    item_type,
    prompt,
    answer_key,
    status
  )
  values (
    v_item_b2,
    1,
    'multiple_choice',
    jsonb_build_object(
      'text', 'Mixed-band B2',
      'options', jsonb_build_array(
        jsonb_build_object('id', 'a', 'label', 'Correct'),
        jsonb_build_object('id', 'b', 'label', 'Wrong')
      )
    ),
    jsonb_build_object('correctOptionId', 'a'),
    'active'
  )
  returning id into v_version_b2;


  v_assessment := public.cefr_v2_create_assessment(
    v_user,
    'zz',
    'initial_placement',
    null,
    array[v_version_b1, v_version_b2]
  );


  -- Answer B1 correctly.
  select id into v_response
  from public.assessment_responses
  where assessment_id = v_assessment
    and item_version_id = v_version_b1;

  if not public.cefr_v2_record_response(
    v_response,
    v_user,
    'a',
    null
  ) then
    raise exception 'VERIFY_FAIL: could not record B1 response';
  end if;


  -- Answer B2 correctly.
  select id into v_response
  from public.assessment_responses
  where assessment_id = v_assessment
    and item_version_id = v_version_b2;

  if not public.cefr_v2_record_response(
    v_response,
    v_user,
    'a',
    null
  ) then
    raise exception 'VERIFY_FAIL: could not record B2 response';
  end if;


  -- This is the exact call that raised 23514 before 0008.
  v_submit := public.cefr_v2_submit_assessment(
    v_assessment,
    v_user
  );


  select estimated_level, raw_score
    into v_result_level, v_raw_score
  from public.assessment_skill_results
  where assessment_id = v_assessment
    and skill = 'grammar';


  if v_raw_score <> 100 then
    raise exception
      'VERIFY_FAIL: mixed-band raw_score expected 100, got %',
      v_raw_score;
  end if;

  if v_result_level is not null then
    raise exception
      'VERIFY_FAIL: mixed-band estimated_level must be NULL, got %',
      v_result_level;
  end if;

  -- Requirement B/D: no invalid ('estimated', NULL) row, and no row at
  -- all, since there was no prior cumulative state for this skill.
  select count(*)
    into v_skill_state_count
  from public.cefr_skill_states
  where user_id = v_user and target_language_code = 'zz' and skill = 'grammar';

  if v_skill_state_count <> 0 then
    raise exception
      'VERIFY_FAIL: mixed-band evidence created a cefr_skill_states row (expected none), count = %',
      v_skill_state_count;
  end if;


  -- Idempotency: second submit must not duplicate results.
  v_submit_again := public.cefr_v2_submit_assessment(
    v_assessment,
    v_user
  );

  if coalesce(
    (v_submit_again ->> 'alreadySubmitted')::boolean,
    false
  ) is not true then
    raise exception
      'VERIFY_FAIL: second submit was not reported as alreadySubmitted';
  end if;

  select count(*)
    into v_result_count
  from public.assessment_skill_results
  where assessment_id = v_assessment
    and skill = 'grammar';

  if v_result_count <> 1 then
    raise exception
      'VERIFY_FAIL: duplicate assessment_skill_results created by repeated submit';
  end if;


  raise notice 'PASS 12: mixed-band stays unresolved, writes no cefr_skill_states row, and submit is idempotent';
end;
$$;


-- ============================================================
-- 13. WRITING FINALIZATION MUST REFUSE INCOMPLETE EVIDENCE
--
-- Also serves as 0008 regression test #7: cefr_v2_finalize_writing_skill
-- and the writing branch of cefr_v2_submit_assessment (the
-- v_has_writing check and 'evaluating' transition) were not touched by
-- 0008's fix, which only guards the MCQ per-skill cefr_skill_states
-- write — this section exercising that path unchanged is what confirms
-- 0008 did not regress it.
-- ============================================================

do $$
declare
  v_user uuid;
  v_rubric uuid;

  v_item uuid;
  v_version uuid;

  v_assessment uuid;
  v_response uuid;

  v_submit jsonb;
  v_status text;
begin
  select id into v_user
  from auth.users
  order by created_at
  limit 1;


  -- Re-use the active rubric created/found above.
  v_rubric :=
    current_setting('hellomova.test_rubric_id')::uuid;


  insert into public.assessment_items (
    target_language_code,
    skill,
    cefr_target
  )
  values (
    'en',
    'writing',
    'B1'
  )
  returning id into v_item;


  insert into public.assessment_item_versions (
    item_id,
    version_number,
    item_type,
    prompt,
    answer_key,
    rubric_version_id,
    status
  )
  values (
    v_item,
    1,
    'writing_prompt',
    jsonb_build_object(
      'text',
      'Write a short paragraph about your day.'
    ),
    null,
    v_rubric,
    'active'
  )
  returning id into v_version;


  v_assessment := public.cefr_v2_create_assessment(
    v_user,
    'en',
    'initial_placement',
    null,
    array[v_version]
  );


  select id into v_response
  from public.assessment_responses
  where assessment_id = v_assessment
    and item_version_id = v_version;


  if not public.cefr_v2_record_response(
    v_response,
    v_user,
    null,
    'This is a real temporary writing response for live database verification.'
  ) then
    raise exception
      'VERIFY_FAIL: writing response could not be recorded';
  end if;


  v_submit := public.cefr_v2_submit_assessment(
    v_assessment,
    v_user
  );


  select status into v_status
  from public.language_assessments
  where id = v_assessment;

  if v_status <> 'evaluating' then
    raise exception
      'VERIFY_FAIL: writing assessment expected evaluating status, got %',
      v_status;
  end if;


  -- No writing_evaluations row exists.
  -- Finalization MUST refuse to complete.
  begin
    perform public.cefr_v2_finalize_writing_skill(
      v_assessment,
      v_user,
      75
    );

    raise exception
      'VERIFY_FAIL: writing assessment finalized without a persisted writing_evaluation';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then
        raise;
      end if;

      if position('still lack an evaluation' in sqlerrm) = 0 then
        raise;
      end if;

      raise notice 'PASS 13A: incomplete writing evidence blocks finalization';
  end;


  select status into v_status
  from public.language_assessments
  where id = v_assessment;

  if v_status <> 'evaluating' then
    raise exception
      'VERIFY_FAIL: failed writing finalization changed assessment status to %',
      v_status;
  end if;


  raise notice 'PASS 13: writing assessment remains safely retryable';
end;
$$;


-- ============================================================
-- 14. language_assessments HISTORICAL FIELD PROTECTION
-- ============================================================

do $$
declare
  v_user uuid;
  v_item uuid;
  v_version uuid;
  v_assessment uuid;
begin
  select id into v_user
  from auth.users
  order by created_at
  limit 1;

  insert into public.assessment_items (
    target_language_code,
    skill,
    cefr_target
  )
  values (
    'en',
    'reading',
    'A2'
  )
  returning id into v_item;

  insert into public.assessment_item_versions (
    item_id,
    version_number,
    item_type,
    prompt,
    answer_key,
    status
  )
  values (
    v_item,
    1,
    'multiple_choice',
    jsonb_build_object(
      'text', 'Historical field protection test',
      'options', jsonb_build_array(
        jsonb_build_object('id', 'a', 'label', 'A'),
        jsonb_build_object('id', 'b', 'label', 'B')
      )
    ),
    jsonb_build_object('correctOptionId', 'a'),
    'active'
  )
  returning id into v_version;

  v_assessment := public.cefr_v2_create_assessment(
    v_user,
    'en',
    'initial_placement',
    null,
    array[v_version]
  );


  -- source_cefr_level is identity-like and must never change.
  begin
    update public.language_assessments
    set source_cefr_level = 'B1'
    where id = v_assessment;

    raise exception
      'VERIFY_FAIL: source_cefr_level was mutable after assessment creation';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then
        raise;
      end if;

      if position('immutable' in sqlerrm) = 0 then
        raise;
      end if;

      raise notice 'PASS 14: source_cefr_level is structurally immutable';
  end;
end;
$$;


-- ============================================================
-- 15. SINGLE-BAND PASSING EVIDENCE — cumulative state becomes estimated
-- with that band (0008 regression test #1). Synthetic language 'zz',
-- skill 'vocabulary' (distinct from section 12's 'grammar' so the two
-- tests can never interfere with each other).
-- ============================================================

do $$
declare
  v_user uuid;
  v_item uuid;
  v_version uuid;
  v_assessment uuid;
  v_response uuid;
  v_status text;
  v_level text;
begin
  select id into v_user
  from auth.users
  order by created_at
  limit 1;

  if exists (
    select 1 from public.cefr_skill_states
    where user_id = v_user and target_language_code = 'zz' and skill = 'vocabulary'
  ) then
    raise exception
      'VERIFY_FAIL: precondition violated — a cefr_skill_states row already exists for (user, zz, vocabulary)';
  end if;

  insert into public.assessment_items (target_language_code, skill, cefr_target)
  values ('zz', 'vocabulary', 'B1')
  returning id into v_item;

  insert into public.assessment_item_versions (
    item_id, version_number, item_type, prompt, answer_key, status
  )
  values (
    v_item, 1, 'multiple_choice',
    jsonb_build_object(
      'text', 'Single-band passing',
      'options', jsonb_build_array(
        jsonb_build_object('id', 'a', 'label', 'Correct'),
        jsonb_build_object('id', 'b', 'label', 'Wrong')
      )
    ),
    jsonb_build_object('correctOptionId', 'a'),
    'active'
  )
  returning id into v_version;

  v_assessment := public.cefr_v2_create_assessment(
    v_user, 'zz', 'initial_placement', null, array[v_version]
  );

  select id into v_response
  from public.assessment_responses
  where assessment_id = v_assessment and item_version_id = v_version;

  if not public.cefr_v2_record_response(v_response, v_user, 'a', null) then
    raise exception 'VERIFY_FAIL: could not record single-band passing response';
  end if;

  perform public.cefr_v2_submit_assessment(v_assessment, v_user);

  select status, estimated_level into v_status, v_level
  from public.cefr_skill_states
  where user_id = v_user and target_language_code = 'zz' and skill = 'vocabulary';

  if v_status is distinct from 'estimated' or v_level is distinct from 'B1' then
    raise exception
      'VERIFY_FAIL: single-band passing evidence expected estimated/B1, got %/%',
      v_status, v_level;
  end if;

  raise notice 'PASS 15: single-band passing evidence becomes a real cumulative estimate';
end;
$$;


-- ============================================================
-- 16. SINGLE-BAND FAILING EVIDENCE — no invalid estimated/null state is
-- written (0008 regression test #2). Synthetic language 'zz', skill
-- 'reading' (distinct from sections 12 and 15).
-- ============================================================

do $$
declare
  v_user uuid;
  v_item uuid;
  v_version uuid;
  v_assessment uuid;
  v_response uuid;
  v_count int;
begin
  select id into v_user
  from auth.users
  order by created_at
  limit 1;

  if exists (
    select 1 from public.cefr_skill_states
    where user_id = v_user and target_language_code = 'zz' and skill = 'reading'
  ) then
    raise exception
      'VERIFY_FAIL: precondition violated — a cefr_skill_states row already exists for (user, zz, reading)';
  end if;

  insert into public.assessment_items (target_language_code, skill, cefr_target)
  values ('zz', 'reading', 'B1')
  returning id into v_item;

  insert into public.assessment_item_versions (
    item_id, version_number, item_type, prompt, answer_key, status
  )
  values (
    v_item, 1, 'multiple_choice',
    jsonb_build_object(
      'text', 'Single-band failing',
      'options', jsonb_build_array(
        jsonb_build_object('id', 'a', 'label', 'Correct'),
        jsonb_build_object('id', 'b', 'label', 'Wrong')
      )
    ),
    jsonb_build_object('correctOptionId', 'a'),
    'active'
  )
  returning id into v_version;

  v_assessment := public.cefr_v2_create_assessment(
    v_user, 'zz', 'initial_placement', null, array[v_version]
  );

  select id into v_response
  from public.assessment_responses
  where assessment_id = v_assessment and item_version_id = v_version;

  -- Answer WRONG on purpose — below the 2/3 pass threshold.
  if not public.cefr_v2_record_response(v_response, v_user, 'b', null) then
    raise exception 'VERIFY_FAIL: could not record single-band failing response';
  end if;

  perform public.cefr_v2_submit_assessment(v_assessment, v_user);

  select count(*) into v_count
  from public.cefr_skill_states
  where user_id = v_user and target_language_code = 'zz' and skill = 'reading';

  if v_count <> 0 then
    raise exception
      'VERIFY_FAIL: failing single-band evidence created a cefr_skill_states row (expected none), count = %',
      v_count;
  end if;

  raise notice 'PASS 16: single-band failing evidence writes no invalid or fabricated state';
end;
$$;


-- ============================================================
-- 17. AN EXISTING VALID ESTIMATE SURVIVES A LATER UNRESOLVED MIXED-BAND
-- ATTEMPT (0008 regression test #4 — the most important one: this is
-- what would silently downgrade/erase real learner progress if wrong).
-- Reuses section 15's real estimated/B1 row for (user, zz, vocabulary),
-- then submits a SECOND, mixed-band (B1+B2) assessment for the SAME
-- skill. Expected: the B1 row from section 15 is untouched.
-- ============================================================

do $$
declare
  v_user uuid;

  v_item_b1 uuid;
  v_item_b2 uuid;
  v_version_b1 uuid;
  v_version_b2 uuid;

  v_assessment uuid;
  v_response uuid;

  v_status_before text;
  v_level_before text;
  v_status_after text;
  v_level_after text;
  v_last_assessment_before uuid;
  v_last_assessment_after uuid;
begin
  select id into v_user
  from auth.users
  order by created_at
  limit 1;

  select status, estimated_level, last_assessment_id
    into v_status_before, v_level_before, v_last_assessment_before
  from public.cefr_skill_states
  where user_id = v_user and target_language_code = 'zz' and skill = 'vocabulary';

  if v_status_before is distinct from 'estimated' or v_level_before is distinct from 'B1' then
    raise exception
      'VERIFY_FAIL: precondition violated — expected section 15''s estimated/B1 row to exist, got %/%',
      v_status_before, v_level_before;
  end if;

  insert into public.assessment_items (target_language_code, skill, cefr_target)
  values ('zz', 'vocabulary', 'B1')
  returning id into v_item_b1;

  insert into public.assessment_item_versions (
    item_id, version_number, item_type, prompt, answer_key, status
  )
  values (
    v_item_b1, 1, 'multiple_choice',
    jsonb_build_object(
      'text', 'Later mixed-band B1',
      'options', jsonb_build_array(
        jsonb_build_object('id', 'a', 'label', 'Correct'),
        jsonb_build_object('id', 'b', 'label', 'Wrong')
      )
    ),
    jsonb_build_object('correctOptionId', 'a'),
    'active'
  )
  returning id into v_version_b1;

  insert into public.assessment_items (target_language_code, skill, cefr_target)
  values ('zz', 'vocabulary', 'B2')
  returning id into v_item_b2;

  insert into public.assessment_item_versions (
    item_id, version_number, item_type, prompt, answer_key, status
  )
  values (
    v_item_b2, 1, 'multiple_choice',
    jsonb_build_object(
      'text', 'Later mixed-band B2',
      'options', jsonb_build_array(
        jsonb_build_object('id', 'a', 'label', 'Correct'),
        jsonb_build_object('id', 'b', 'label', 'Wrong')
      )
    ),
    jsonb_build_object('correctOptionId', 'a'),
    'active'
  )
  returning id into v_version_b2;

  v_assessment := public.cefr_v2_create_assessment(
    v_user, 'zz', 'reassessment', 'B1', array[v_version_b1, v_version_b2]
  );

  select id into v_response
  from public.assessment_responses
  where assessment_id = v_assessment and item_version_id = v_version_b1;
  if not public.cefr_v2_record_response(v_response, v_user, 'a', null) then
    raise exception 'VERIFY_FAIL: could not record later-attempt B1 response';
  end if;

  select id into v_response
  from public.assessment_responses
  where assessment_id = v_assessment and item_version_id = v_version_b2;
  if not public.cefr_v2_record_response(v_response, v_user, 'a', null) then
    raise exception 'VERIFY_FAIL: could not record later-attempt B2 response';
  end if;

  -- This is the exact scenario that would previously raise 23514 AND,
  -- if merely swallowed instead of fixed, could have erased the prior
  -- B1 estimate instead of raising at all.
  perform public.cefr_v2_submit_assessment(v_assessment, v_user);

  select status, estimated_level, last_assessment_id
    into v_status_after, v_level_after, v_last_assessment_after
  from public.cefr_skill_states
  where user_id = v_user and target_language_code = 'zz' and skill = 'vocabulary';

  if v_status_after is distinct from 'estimated' or v_level_after is distinct from 'B1' then
    raise exception
      'VERIFY_FAIL: prior valid estimate was erased/downgraded by unresolved mixed-band evidence — now %/%',
      v_status_after, v_level_after;
  end if;

  if v_last_assessment_after is distinct from v_last_assessment_before then
    raise exception
      'VERIFY_FAIL: last_assessment_id changed even though the mixed-band attempt should not have touched this row';
  end if;

  raise notice 'PASS 17: an existing valid cumulative estimate survives a later unresolved mixed-band attempt unchanged';
end;
$$;


-- ============================================================
-- FINAL SUCCESS MESSAGE
-- ============================================================

do $$
begin
  raise notice '============================================================';
  raise notice 'HELLOMOVA 0007+0008 LIVE VERIFICATION: ALL TESTS PASSED';
  raise notice 'The transaction will now ROLLBACK all temporary test data.';
  raise notice '============================================================';
end;
$$;


-- ============================================================
-- SINGLE UNAMBIGUOUS SUCCESS ROW FOR THE SUPABASE SQL EDITOR
--
-- The RAISE NOTICE messages above are not reliably surfaced in the
-- Supabase SQL Editor's result grid. This plain SELECT is a normal
-- result set — it is only reached if every `raise exception` above did
-- NOT fire (an exception aborts the whole script before execution ever
-- reaches this line), so its presence in the result grid is itself the
-- pass/fail signal, not just another log line.
-- ============================================================

select
  'HELLOMOVA 0007+0008 LIVE VERIFICATION: ALL TESTS PASSED'
  as verification_status;


-- ============================================================
-- CRITICAL:
-- Roll back every temporary test row/change created above.
-- ============================================================

rollback;
