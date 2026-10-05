-- Disposable database only; no production connection. Runs after
-- supabase/migrations/20261005_contributor_access.sql and supabase/tests/key_revocation.sql.
-- Keys here are named by their stored key_hash (the fingerprint) or by their label.
do $$
declare
  v_id uuid;
  v_out json;
begin
  -- A key without a tier keeps the standard limit and the original return codes.
  insert into public.api_keys(key_hash, label) values ('standard-hash', 'standard');
  if public.consume_quota('standard-hash', 2) <> 1 then raise exception 'standard key: first admission'; end if;
  if public.consume_quota('standard-hash', 2) <> 0 then raise exception 'standard key: second admission'; end if;
  if public.consume_quota('standard-hash', 2) <> -1 then raise exception 'standard key: admitted over its limit'; end if;
  v_out := public.consume_quota_with_limit('standard-hash', 2);
  if (v_out->>'remaining')::integer <> -1 or (v_out->>'daily_limit')::integer <> 2 then raise exception 'standard key: limit reported as %', v_out; end if;
  if public.consume_quota('unknown-hash', 2) <> -2 then raise exception 'unknown key admitted'; end if;
  v_out := public.consume_quota_with_limit('unknown-hash', 2);
  if (v_out->>'remaining')::integer <> -2 or (v_out->>'daily_limit')::integer <> 2 then raise exception 'unknown key: %', v_out; end if;
  if (select calls from public.api_usage_daily u join public.api_keys k on k.id = u.key_id where k.key_hash = 'standard-hash') <> 4 then
    raise exception 'standard key: every admission attempt must be counted, as before';
  end if;
  v_out := public.read_key_tier('standard-hash');
  if v_out->>'label' <> 'standard' or v_out->>'tier' is not null or v_out->>'daily_limit' is not null or v_out->>'granted_at' is not null then
    raise exception 'standard key read as %', v_out;
  end if;

  -- Granted by fingerprint, a key gets the larger limit from both admission functions.
  insert into public.api_keys(key_hash, label) values ('contributor-hash', 'contributor') returning id into v_id;
  v_out := public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 4, p_github_login => 'octo-cat', p_key_hash => 'CONTRIBUTOR-HASH', p_note => 'PR 1');
  if not (v_out->>'granted')::boolean or v_out->>'matched_by' <> 'fingerprint' or v_out->>'fingerprint' <> 'contributor-hash'
     or v_out->>'label' <> 'contributor' or v_out->>'tier' <> 'contributor' or (v_out->>'daily_limit')::integer <> 4
     or v_out->>'github_login' <> 'octo-cat' or v_out->>'note' <> 'PR 1' then
    raise exception 'grant by fingerprint returned %', v_out;
  end if;
  if (select key_id from public.key_tiers) is distinct from v_id then raise exception 'the tier is not on the named key'; end if;
  if public.consume_quota('contributor-hash', 2) <> 3 then raise exception 'contributor key: tier limit not applied'; end if;
  v_out := public.consume_quota_with_limit('contributor-hash', 2);
  if (v_out->>'remaining')::integer <> 2 or (v_out->>'daily_limit')::integer <> 4 then raise exception 'contributor key: %', v_out; end if;
  if public.consume_quota('contributor-hash', 2) <> 1 then raise exception 'contributor key: third admission'; end if;
  if public.consume_quota('contributor-hash', 2) <> 0 then raise exception 'contributor key: fourth admission'; end if;
  v_out := public.consume_quota_with_limit('contributor-hash', 2);
  if (v_out->>'remaining')::integer <> -1 or (v_out->>'daily_limit')::integer <> 4 then raise exception 'contributor key: admitted over its tier limit: %', v_out; end if;
  -- The tier raises a limit and never lowers it.
  if public.consume_quota('contributor-hash', 10) <> 4 then raise exception 'a tier below the caller limit lowered it'; end if;
  v_out := public.read_key_tier('contributor-hash');
  if v_out->>'label' <> 'contributor' or v_out->>'tier' <> 'contributor' or (v_out->>'daily_limit')::integer <> 4 or v_out->>'granted_at' is null
     or v_out::jsonb ? 'github_login' or v_out::jsonb ? 'key_id' or v_out::jsonb ? 'note' then
    raise exception 'contributor key read as %', v_out;
  end if;

  -- A label that exactly one active key carries names that key; fingerprint and label together must agree.
  v_out := public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 9, p_github_login => 'octo-cat', p_label => 'contributor');
  if not (v_out->>'granted')::boolean or v_out->>'matched_by' <> 'label' or v_out->>'fingerprint' <> 'contributor-hash'
     or (v_out->>'daily_limit')::integer <> 9 or v_out->>'note' is not null then
    raise exception 're-grant by label returned %', v_out;
  end if;
  if (select count(*) from public.key_tiers where key_id = v_id) <> 1 then raise exception 're-grant duplicated the tier'; end if;
  if public.consume_quota('contributor-hash', 2) <> 2 then raise exception 'contributor key: re-granted limit not applied'; end if;
  v_out := public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 9, p_github_login => 'octo-cat', p_key_hash => 'contributor-hash', p_label => 'contributor');
  if not (v_out->>'granted')::boolean or v_out->>'matched_by' <> 'fingerprint' then raise exception 'grant by agreeing fingerprint and label returned %', v_out; end if;
  v_out := public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 9, p_github_login => 'octo-cat', p_key_hash => 'contributor-hash', p_label => 'standard');
  if (v_out->>'granted')::boolean or v_out->>'reason' <> 'label_mismatch' then raise exception 'disagreeing fingerprint and label granted: %', v_out; end if;

  -- A label carried by more than one active key names none of them; the fingerprint still works.
  insert into public.api_keys(key_hash, label) values ('shared-one-hash', 'shared'), ('shared-two-hash', 'shared');
  v_out := public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 4, p_github_login => 'octo-cat', p_label => 'shared');
  if (v_out->>'granted')::boolean or v_out->>'reason' <> 'ambiguous_label' or v_out->>'fingerprint' is not null then raise exception 'ambiguous label granted: %', v_out; end if;
  if (select count(*) from public.key_tiers k join public.api_keys a on a.id = k.key_id where a.label = 'shared') <> 0 then raise exception 'ambiguous label granted a tier'; end if;
  if not (public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 4, p_github_login => 'octo-cat', p_key_hash => 'shared-two-hash')->>'granted')::boolean then
    raise exception 'grant by fingerprint of a shared-label key';
  end if;
  if public.read_key_tier('shared-one-hash')->>'tier' is not null or public.read_key_tier('shared-two-hash')->>'tier' <> 'contributor' then
    raise exception 'the tier landed on the wrong shared-label key';
  end if;

  -- Removing a tier, by label or fingerprint, returns the key to the standard limit, once.
  v_out := public.revoke_key_tier(p_label => 'contributor');
  if not (v_out->>'revoked')::boolean or v_out->>'matched_by' <> 'label' or v_out->>'fingerprint' <> 'contributor-hash' then raise exception 'tier revoke by label returned %', v_out; end if;
  v_out := public.revoke_key_tier(p_key_hash => 'contributor-hash');
  if (v_out->>'revoked')::boolean or v_out->>'reason' <> 'no_tier' then raise exception 'a second tier revoke claimed to remove something: %', v_out; end if;
  v_out := public.consume_quota_with_limit('contributor-hash', 2);
  if (v_out->>'remaining')::integer <> -1 or (v_out->>'daily_limit')::integer <> 2 then raise exception 'removed tier still applied: %', v_out; end if;
  if public.read_key_tier('contributor-hash')->>'tier' is not null then raise exception 'removed tier still read'; end if;

  -- A revoked key is refused whatever its tier, cannot be read and cannot be granted.
  insert into public.api_keys(key_hash, label) values ('revoked-hash', 'revoked-label');
  if not (public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 4, p_github_login => 'octo-cat', p_key_hash => 'revoked-hash')->>'granted')::boolean then raise exception 'grant before revocation'; end if;
  if not (public.revoke_key('revoked-hash')->>'revoked')::boolean then raise exception 'revoke tiered key'; end if;
  if public.consume_quota('revoked-hash', 2) <> -2 then raise exception 'revoked tiered key admitted'; end if;
  v_out := public.consume_quota_with_limit('revoked-hash', 2);
  if (v_out->>'remaining')::integer <> -2 then raise exception 'revoked tiered key admitted: %', v_out; end if;
  if exists (select 1 from public.api_usage_daily u join public.api_keys k on k.id = u.key_id where k.key_hash = 'revoked-hash') then raise exception 'revoked tiered key was charged'; end if;
  if public.read_key_tier('revoked-hash') is not null then raise exception 'revoked key readable'; end if;
  v_out := public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 4, p_github_login => 'octo-cat', p_key_hash => 'revoked-hash');
  if (v_out->>'granted')::boolean or v_out->>'reason' <> 'revoked_key' then raise exception 'revoked key granted by fingerprint: %', v_out; end if;
  v_out := public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 4, p_github_login => 'octo-cat', p_label => 'revoked-label');
  if (v_out->>'granted')::boolean or v_out->>'reason' <> 'revoked_key' then raise exception 'revoked key granted by label: %', v_out; end if;
  -- Its leftover tier can still be removed by fingerprint.
  if not (public.revoke_key_tier(p_key_hash => 'revoked-hash')->>'revoked')::boolean then raise exception 'tier of a revoked key not removable'; end if;

  -- Nothing, or nothing that exists, names no key.
  v_out := public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 4, p_github_login => 'octo-cat', p_key_hash => repeat('0', 64));
  if (v_out->>'granted')::boolean or v_out->>'reason' <> 'unknown_key' then raise exception 'unknown fingerprint granted: %', v_out; end if;
  v_out := public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 4, p_github_login => 'octo-cat', p_label => 'no-such-label');
  if (v_out->>'granted')::boolean or v_out->>'reason' <> 'unknown_key' then raise exception 'unknown label granted: %', v_out; end if;
  v_out := public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 4, p_github_login => 'octo-cat');
  if (v_out->>'granted')::boolean or v_out->>'reason' <> 'no_key_named' then raise exception 'grant naming no key: %', v_out; end if;
  v_out := public.revoke_key_tier();
  if (v_out->>'revoked')::boolean or v_out->>'reason' <> 'no_key_named' then raise exception 'revoke naming no key: %', v_out; end if;
  if public.read_key_tier('unknown-hash') is not null then raise exception 'unknown key readable'; end if;

  -- The table refuses any other tier, a limit below one, a malformed login and a long note.
  begin perform public.grant_key_tier(p_tier => 'gold', p_daily_limit => 4, p_github_login => 'octo-cat', p_key_hash => 'contributor-hash'); raise exception 'unknown tier accepted'; exception when check_violation then null; end;
  begin perform public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 0, p_github_login => 'octo-cat', p_key_hash => 'contributor-hash'); raise exception 'zero limit accepted'; exception when check_violation then null; end;
  begin perform public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 4, p_github_login => 'not a login', p_key_hash => 'contributor-hash'); raise exception 'malformed login accepted'; exception when check_violation then null; end;
  begin perform public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 4, p_github_login => 'octo-cat', p_key_hash => 'contributor-hash', p_note => repeat('x', 501)); raise exception 'long note accepted'; exception when check_violation then null; end;

  -- Client roles hold no privilege on the table or the functions; the service role runs the entry
  -- points, and nobody but their owner runs the key resolver.
  if has_table_privilege('anon', 'public.key_tiers', 'SELECT') or has_table_privilege('authenticated', 'public.key_tiers', 'SELECT')
     or has_table_privilege('anon', 'public.key_tiers', 'INSERT') or has_table_privilege('authenticated', 'public.key_tiers', 'UPDATE') then
    raise exception 'a client role can use key_tiers';
  end if;
  if has_function_privilege('anon', 'public.grant_key_tier(text,integer,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.grant_key_tier(text,integer,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.revoke_key_tier(text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.revoke_key_tier(text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.read_key_tier(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.read_key_tier(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.consume_quota_with_limit(text,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.consume_quota_with_limit(text,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.consume_quota(text,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.consume_quota(text,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.resolve_tier_key(text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.resolve_tier_key(text,text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.resolve_tier_key(text,text)', 'EXECUTE') then
    raise exception 'a client role can execute a quota or tier function';
  end if;
  if not (has_function_privilege('service_role', 'public.grant_key_tier(text,integer,text,text,text,text)', 'EXECUTE')
     and has_function_privilege('service_role', 'public.revoke_key_tier(text,text)', 'EXECUTE')
     and has_function_privilege('service_role', 'public.read_key_tier(text)', 'EXECUTE')
     and has_function_privilege('service_role', 'public.consume_quota_with_limit(text,integer)', 'EXECUTE')
     and has_function_privilege('service_role', 'public.consume_quota(text,integer)', 'EXECUTE')) then
    raise exception 'the service role cannot run a quota or tier function';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.key_tiers'::regclass) then raise exception 'key_tiers has RLS off'; end if;
end $$;

-- The refusals as client roles actually raise, rather than only reading as absent privileges.
set role anon;
do $$
begin
  begin perform 1 from public.key_tiers; raise exception 'anon read key_tiers'; exception when insufficient_privilege then null; end;
  begin perform public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 4, p_github_login => 'octo-cat', p_key_hash => 'standard-hash'); raise exception 'anon called grant_key_tier'; exception when insufficient_privilege then null; end;
  begin perform public.read_key_tier('standard-hash'); raise exception 'anon called read_key_tier'; exception when insufficient_privilege then null; end;
  begin perform public.resolve_tier_key('standard-hash', null); raise exception 'anon called resolve_tier_key'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
do $$
begin
  begin perform 1 from public.key_tiers; raise exception 'authenticated read key_tiers'; exception when insufficient_privilege then null; end;
  begin perform public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 4, p_github_login => 'octo-cat', p_key_hash => 'standard-hash'); raise exception 'authenticated called grant_key_tier'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- The service role grants, reads and removes through the entry points alone.
insert into public.api_keys(key_hash, label) values ('service-tier-hash', 'service role test');
set role service_role;
do $$
begin
  if not (public.grant_key_tier(p_tier => 'contributor', p_daily_limit => 4, p_github_login => 'octo-cat', p_key_hash => 'service-tier-hash')->>'granted')::boolean then raise exception 'service role grant failed'; end if;
  if public.read_key_tier('service-tier-hash')->>'tier' is distinct from 'contributor' then raise exception 'service role read failed'; end if;
  if not (public.revoke_key_tier(p_key_hash => 'service-tier-hash')->>'revoked')::boolean then raise exception 'service role tier revoke failed'; end if;
  begin perform public.resolve_tier_key('service-tier-hash', null); raise exception 'service role called resolve_tier_key'; exception when insufficient_privilege then null; end;
end $$;
reset role;
