-- ============================================================
-- HELLOMOVA — PRONUNCIATION / MARY (PHASE 8)
-- LIVE DATABASE VERIFICATION FOR MIGRATION 0009
--
-- SAFE:
-- Everything is executed inside one transaction.
-- Final ROLLBACK removes all temporary test rows/changes.
--
-- DO NOT REMOVE THE FINAL ROLLBACK.
--
-- Prerequisite: 0009_pronunciation.sql must already be applied to the
-- target database (this script only verifies it — it creates no schema
-- of its own). Run this by pasting it into the Supabase SQL editor for
-- the project 0009 has been applied to, or via `psql`/any client with a
-- direct Postgres connection. It cannot be run through the REST/
-- PostgREST API (no arbitrary multi-statement SQL, SET ROLE, or
-- transactions there).
--
-- Uses a synthetic target_language_code ('zz', never a real
-- launch-catalog code — pronunciation_attempts.target_language_code has
-- no CHECK/FK tying it to the real catalog) purely for readability; it
-- carries no special meaning here since every row this script creates is
-- rolled back regardless.
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

  raise notice 'PASS 0: preflight — auth user exists';
end;
$$;


-- ============================================================
-- 1. TABLE EXISTS
-- ============================================================

do $$
begin
  if to_regclass('public.pronunciation_attempts') is null then
    raise exception
      'VERIFY_FAIL: public.pronunciation_attempts does not exist — is 0009 applied?';
  end if;

  raise notice 'PASS 1: pronunciation_attempts exists';
end;
$$;


-- ============================================================
-- 2. EFFECTIVE PRIVILEGES — authenticated / anon
--
-- pronunciation_attempts uses a pure TABLE-LEVEL revoke (no column-level
-- grants at all — see 0009's header comment), unlike user_languages in
-- 0007 which needed column-level grants alongside a table-level revoke.
-- has_table_privilege alone is therefore the correct and sufficient
-- check here; has_column_privilege would add nothing since no column
-- grant exists to narrow.
-- ============================================================

do $$
begin
  if has_table_privilege('authenticated', 'public.pronunciation_attempts', 'INSERT') then
    raise exception
      'SECURITY FAIL: authenticated can INSERT into pronunciation_attempts';
  end if;

  if has_table_privilege('authenticated', 'public.pronunciation_attempts', 'UPDATE') then
    raise exception
      'SECURITY FAIL: authenticated can UPDATE pronunciation_attempts';
  end if;

  if has_table_privilege('authenticated', 'public.pronunciation_attempts', 'DELETE') then
    raise exception
      'SECURITY FAIL: authenticated can DELETE pronunciation_attempts';
  end if;

  -- SELECT was never revoked — reads are intentionally governed by RLS
  -- alone (see section 5/6 below), same pattern as lesson_sessions.
  if not has_table_privilege('authenticated', 'public.pronunciation_attempts', 'SELECT') then
    raise exception
      'SECURITY FAIL: authenticated unexpectedly cannot SELECT pronunciation_attempts at all';
  end if;

  if has_table_privilege('anon', 'public.pronunciation_attempts', 'INSERT') then
    raise exception
      'SECURITY FAIL: anon can INSERT into pronunciation_attempts';
  end if;

  if has_table_privilege('anon', 'public.pronunciation_attempts', 'UPDATE') then
    raise exception
      'SECURITY FAIL: anon can UPDATE pronunciation_attempts';
  end if;

  if has_table_privilege('anon', 'public.pronunciation_attempts', 'DELETE') then
    raise exception
      'SECURITY FAIL: anon can DELETE pronunciation_attempts';
  end if;

  raise notice 'PASS 2: effective table privileges for authenticated/anon are correct';
end;
$$;


-- ============================================================
-- 3. CREATE A REAL TEST ROW (as table owner — the same effective
-- privilege level service_role writes with, since service_role bypasses
-- RLS/grants entirely via BYPASSRLS rather than via a table grant; see
-- 0009's header comment). This row stays 'pending' through section 8.
-- ============================================================

do $$
declare
  v_user uuid;
  v_attempt uuid;
begin
  select id into v_user
  from auth.users
  order by created_at
  limit 1;

  insert into public.pronunciation_attempts (
    user_id,
    target_language_code,
    native_language_code,
    target_text,
    prompt_version
  )
  values (
    v_user,
    'zz',
    'zz',
    'Verification phrase, never shown to a real learner.',
    'verify-0009'
  )
  returning id into v_attempt;

  perform set_config('hellomova.test_attempt_id', v_attempt::text, true);
  perform set_config('hellomova.test_owner_id', v_user::text, true);

  raise notice 'PASS 3: temporary pending pronunciation_attempts row created';
end;
$$;


-- ============================================================
-- 4. REAL AUTHENTICATED WRITE ATTEMPTS MUST FAIL
-- ============================================================

do $$
begin
  perform set_config('request.jwt.claim.sub', current_setting('hellomova.test_owner_id'), true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', current_setting('hellomova.test_owner_id'), 'role', 'authenticated')::text,
    true
  );
end;
$$;

set local role authenticated;

do $$
begin
  -- Even the OWNER cannot insert a fabricated attempt directly.
  begin
    insert into public.pronunciation_attempts (
      user_id, target_language_code, native_language_code, target_text, prompt_version
    )
    values (
      auth.uid(), 'zz', 'zz', 'A browser-fabricated attempt.', 'verify-0009'
    );

    raise exception 'VERIFY_FAIL: authenticated browser was able to INSERT a pronunciation_attempts row';
  exception
    when insufficient_privilege then
      raise notice 'PASS 4A: authenticated cannot INSERT pronunciation_attempts';
  end;

  -- Owner cannot update status/transcript/evaluation/provenance/error on their own row.
  begin
    update public.pronunciation_attempts
    set status = 'completed',
        transcript = 'I spoke perfectly',
        evaluation = jsonb_build_object(
          'recognitionQuality', 'clear',
          'contentMatch', 'close_match',
          'differences', '[]'::jsonb,
          'practiceSuggestion', 'none needed',
          'recognizedTranscript', 'I spoke perfectly',
          'limitations', 'fabricated by the browser'
        ),
        transcription_model = 'whisper-1',
        evaluation_model = 'gpt-4o-mini',
        error_reason = null,
        completed_at = now()
    where id = current_setting('hellomova.test_attempt_id')::uuid;

    raise exception 'VERIFY_FAIL: authenticated browser was able to UPDATE its own pronunciation_attempts row';
  exception
    when insufficient_privilege then
      raise notice 'PASS 4B: authenticated cannot UPDATE status/transcript/evaluation/provenance/error_reason/completed_at';
  end;

  raise notice 'PASS 4: authenticated cannot write trusted pronunciation evidence by any path';
end;
$$;

reset role;


-- ============================================================
-- 4C. ANON CANNOT WRITE EITHER — a real impersonated attempt, not just
-- the has_table_privilege check in section 2.
-- ============================================================

set local role anon;

do $$
begin
  begin
    insert into public.pronunciation_attempts (
      user_id, target_language_code, native_language_code, target_text, prompt_version
    )
    values (
      current_setting('hellomova.test_owner_id')::uuid, 'zz', 'zz', 'An anon-fabricated attempt.', 'verify-0009'
    );

    raise exception 'VERIFY_FAIL: anon was able to INSERT a pronunciation_attempts row';
  exception
    when insufficient_privilege then
      raise notice 'PASS 4C: anon cannot INSERT pronunciation_attempts either';
  end;
end;
$$;

reset role;


-- ============================================================
-- 5. OWNER CAN READ OWN ATTEMPT (RLS)
-- ============================================================

do $$
begin
  perform set_config('request.jwt.claim.sub', current_setting('hellomova.test_owner_id'), true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', current_setting('hellomova.test_owner_id'), 'role', 'authenticated')::text,
    true
  );
end;
$$;

set local role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.pronunciation_attempts
  where id = current_setting('hellomova.test_attempt_id')::uuid;

  if v_count <> 1 then
    raise exception 'RLS FAIL: owner cannot SELECT their own pronunciation_attempts row';
  end if;

  raise notice 'PASS 5: owner RLS read works';
end;
$$;

reset role;


-- ============================================================
-- 6. CROSS-USER SELECT MUST BE BLOCKED
-- ============================================================

do $$
begin
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', current_setting('request.jwt.claim.sub'), 'role', 'authenticated')::text,
    true
  );
end;
$$;

set local role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.pronunciation_attempts
  where id = current_setting('hellomova.test_attempt_id')::uuid;

  if v_count <> 0 then
    raise exception 'RLS FAIL: a different authenticated identity can read someone else''s pronunciation_attempts row';
  end if;

  raise notice 'PASS 6: cross-user read is blocked by RLS';
end;
$$;

reset role;


-- ============================================================
-- 7. SNAPSHOT IMMUTABILITY (table-owner context — proves the TRIGGER
-- enforces this, not just RLS/grants, since this context has the same
-- effective write capability as service_role)
-- ============================================================

do $$
begin
  -- user_id
  begin
    update public.pronunciation_attempts
    set user_id = gen_random_uuid()
    where id = current_setting('hellomova.test_attempt_id')::uuid;
    raise exception 'VERIFY_FAIL: user_id was mutable on a pending row';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then raise; end if;
      if position('immutable' in sqlerrm) = 0 then raise; end if;
      raise notice 'PASS 7A: user_id is immutable (cannot reassign attempt to another user)';
  end;

  -- target_language_code
  begin
    update public.pronunciation_attempts
    set target_language_code = 'fr'
    where id = current_setting('hellomova.test_attempt_id')::uuid;
    raise exception 'VERIFY_FAIL: target_language_code was mutable on a pending row';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then raise; end if;
      if position('immutable' in sqlerrm) = 0 then raise; end if;
      raise notice 'PASS 7B: target_language_code is immutable';
  end;

  -- native_language_code
  begin
    update public.pronunciation_attempts
    set native_language_code = 'fr'
    where id = current_setting('hellomova.test_attempt_id')::uuid;
    raise exception 'VERIFY_FAIL: native_language_code was mutable on a pending row';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then raise; end if;
      if position('immutable' in sqlerrm) = 0 then raise; end if;
      raise notice 'PASS 7C: native_language_code is immutable';
  end;

  -- cefr_level
  begin
    update public.pronunciation_attempts
    set cefr_level = 'C2'
    where id = current_setting('hellomova.test_attempt_id')::uuid;
    raise exception 'VERIFY_FAIL: cefr_level was mutable on a pending row';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then raise; end if;
      if position('immutable' in sqlerrm) = 0 then raise; end if;
      raise notice 'PASS 7D: cefr_level is immutable';
  end;

  -- target_text
  begin
    update public.pronunciation_attempts
    set target_text = 'A different, easier phrase.'
    where id = current_setting('hellomova.test_attempt_id')::uuid;
    raise exception 'VERIFY_FAIL: target_text was mutable on a pending row';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then raise; end if;
      if position('immutable' in sqlerrm) = 0 then raise; end if;
      raise notice 'PASS 7E: target_text is immutable';
  end;

  -- prompt_version
  begin
    update public.pronunciation_attempts
    set prompt_version = 'pronunciation-v2'
    where id = current_setting('hellomova.test_attempt_id')::uuid;
    raise exception 'VERIFY_FAIL: prompt_version was mutable on a pending row';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then raise; end if;
      if position('immutable' in sqlerrm) = 0 then raise; end if;
      raise notice 'PASS 7F: prompt_version is immutable';
  end;

  -- created_at
  begin
    update public.pronunciation_attempts
    set created_at = now() - interval '1 day'
    where id = current_setting('hellomova.test_attempt_id')::uuid;
    raise exception 'VERIFY_FAIL: created_at was mutable on a pending row';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then raise; end if;
      if position('immutable' in sqlerrm) = 0 then raise; end if;
      raise notice 'PASS 7G: created_at is immutable';
  end;

  raise notice 'PASS 7: all snapshot/identity fields are immutable after creation, even for a service-role-equivalent writer';
end;
$$;


-- ============================================================
-- 11. ILLEGAL STATUS TRANSITION — tested here (before 8/9 consume the
-- row) so it still applies to a 'pending' row: neither a no-op
-- ("pending" -> "pending") nor a made-up status is a legal transition.
-- ============================================================

do $$
begin
  begin
    update public.pronunciation_attempts
    set status = 'pending'
    where id = current_setting('hellomova.test_attempt_id')::uuid;
    raise exception 'VERIFY_FAIL: a pending -> pending no-op update was allowed';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then raise; end if;
      if position('cannot update a row and leave it pending' in sqlerrm) = 0 then raise; end if;
      raise notice 'PASS 11A: pending -> pending is rejected (every update must actually resolve the attempt)';
  end;

  begin
    update public.pronunciation_attempts
    set status = 'evaluating'
    where id = current_setting('hellomova.test_attempt_id')::uuid;
    raise exception 'VERIFY_FAIL: an invalid status value was accepted';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then raise; end if;
      if position('invalid status' in sqlerrm) = 0 and sqlstate != '23514' then raise; end if;
      raise notice 'PASS 11B: an invalid/undefined status value is rejected';
  end;

  raise notice 'PASS 11: illegal status transitions are rejected';
end;
$$;


-- ============================================================
-- 8. VALID LIFECYCLE: pending -> completed
-- ============================================================

do $$
declare
  v_status text;
begin
  update public.pronunciation_attempts
  set status = 'completed',
      transcript = 'Je voudrais un café.',
      evaluation = jsonb_build_object(
        'recognitionQuality', 'clear',
        'contentMatch', 'close_match',
        'differences', '[]'::jsonb,
        'practiceSuggestion', 'Keep practicing at a natural pace.',
        'recognizedTranscript', 'Je voudrais un café.',
        'limitations', 'This feedback is based on automatic speech recognition, not acoustic/phoneme analysis.'
      ),
      transcription_model = 'whisper-1',
      evaluation_model = 'gpt-4o-mini',
      completed_at = now()
  where id = current_setting('hellomova.test_attempt_id')::uuid;

  select status into v_status
  from public.pronunciation_attempts
  where id = current_setting('hellomova.test_attempt_id')::uuid;

  if v_status <> 'completed' then
    raise exception 'VERIFY_FAIL: pending -> completed did not persist';
  end if;

  raise notice 'PASS 8: pending -> completed succeeds with required completion fields';
end;
$$;


-- ============================================================
-- 9. VALID FAILURE LIFECYCLE: pending -> failed (fresh row)
-- ============================================================

do $$
declare
  v_user uuid;
  v_attempt uuid;
  v_status text;
begin
  v_user := current_setting('hellomova.test_owner_id')::uuid;

  insert into public.pronunciation_attempts (
    user_id, target_language_code, native_language_code, target_text, prompt_version
  )
  values (
    v_user, 'zz', 'zz', 'Second verification phrase.', 'verify-0009'
  )
  returning id into v_attempt;

  perform set_config('hellomova.test_attempt_id_failed', v_attempt::text, true);

  update public.pronunciation_attempts
  set status = 'failed',
      error_reason = 'Couldn''t process your recording right now. Please try again shortly.',
      completed_at = now()
  where id = v_attempt;

  select status into v_status
  from public.pronunciation_attempts
  where id = v_attempt;

  if v_status <> 'failed' then
    raise exception 'VERIFY_FAIL: pending -> failed did not persist';
  end if;

  raise notice 'PASS 9: pending -> failed succeeds';
end;
$$;


-- ============================================================
-- 10. TERMINAL IMMUTABILITY — completed -> anything, failed -> anything
-- ============================================================

do $$
begin
  -- completed -> pending (reopening) must fail.
  begin
    update public.pronunciation_attempts
    set status = 'pending'
    where id = current_setting('hellomova.test_attempt_id')::uuid;
    raise exception 'VERIFY_FAIL: a completed attempt was reopened to pending';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then raise; end if;
      if position('already terminal' in sqlerrm) = 0 then raise; end if;
      raise notice 'PASS 10A: completed -> pending is rejected';
  end;

  -- completed -> failed must fail.
  begin
    update public.pronunciation_attempts
    set status = 'failed', error_reason = 'retroactively marked failed'
    where id = current_setting('hellomova.test_attempt_id')::uuid;
    raise exception 'VERIFY_FAIL: a completed attempt was changed to failed';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then raise; end if;
      if position('already terminal' in sqlerrm) = 0 then raise; end if;
      raise notice 'PASS 10B: completed -> failed is rejected';
  end;

  -- failed -> completed must fail.
  begin
    update public.pronunciation_attempts
    set status = 'completed',
        evaluation = '{}'::jsonb
    where id = current_setting('hellomova.test_attempt_id_failed')::uuid;
    raise exception 'VERIFY_FAIL: a failed attempt was changed to completed';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then raise; end if;
      if position('already terminal' in sqlerrm) = 0 then raise; end if;
      raise notice 'PASS 10C: failed -> completed is rejected';
  end;

  raise notice 'PASS 10: terminal rows (completed or failed) can never transition again';
end;
$$;


-- ============================================================
-- 12. TERMINAL RESULT MUTATION — after completed, transcript/evaluation
-- cannot be silently rewritten even if status is (redundantly) also set
-- back to 'completed' in the same statement.
-- ============================================================

do $$
declare
  v_transcript text;
begin
  begin
    update public.pronunciation_attempts
    set transcript = 'A rewritten transcript, after the fact.',
        evaluation = jsonb_build_object(
          'recognitionQuality', 'clear',
          'contentMatch', 'close_match',
          'differences', '[]'::jsonb,
          'practiceSuggestion', 'rewritten',
          'recognizedTranscript', 'A rewritten transcript, after the fact.',
          'limitations', 'rewritten'
        )
    where id = current_setting('hellomova.test_attempt_id')::uuid;
    raise exception 'VERIFY_FAIL: a completed attempt''s transcript/evaluation was rewritten';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then raise; end if;
      if position('already terminal' in sqlerrm) = 0 then raise; end if;
  end;

  select transcript into v_transcript
  from public.pronunciation_attempts
  where id = current_setting('hellomova.test_attempt_id')::uuid;

  if v_transcript <> 'Je voudrais un café.' then
    raise exception 'VERIFY_FAIL: the real transcript was changed despite the rejected update';
  end if;

  raise notice 'PASS 12: a completed attempt''s real transcript/evaluation cannot be silently rewritten';
end;
$$;


-- ============================================================
-- 13. CROSS-USER OWNERSHIP — already exercised precisely in 7A
-- (attempting to reassign a pending row's user_id to a different user),
-- the single most direct test of this requirement. Repeated here against
-- the now-completed row for defense in depth: reassignment must also be
-- impossible on a terminal row (via the terminal-lock check instead).
-- ============================================================

do $$
begin
  begin
    update public.pronunciation_attempts
    set user_id = gen_random_uuid()
    where id = current_setting('hellomova.test_attempt_id')::uuid;
    raise exception 'VERIFY_FAIL: a completed attempt was reassigned to a different user_id';
  exception
    when others then
      if sqlerrm like 'VERIFY_FAIL:%' then raise; end if;
      if position('already terminal' in sqlerrm) = 0 then raise; end if;
      raise notice 'PASS 13: a terminal attempt cannot be reassigned to another user either';
  end;
end;
$$;


-- ============================================================
-- FINAL SUCCESS MESSAGE
-- ============================================================

do $$
begin
  raise notice '============================================================';
  raise notice 'HELLOMOVA 0009 PRONUNCIATION LIVE VERIFICATION: ALL TESTS PASSED';
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
  'HELLOMOVA 0009 PRONUNCIATION LIVE VERIFICATION: ALL TESTS PASSED'
  as verification_status;


-- ============================================================
-- CRITICAL:
-- Roll back every temporary test row/change created above.
-- ============================================================

rollback;
