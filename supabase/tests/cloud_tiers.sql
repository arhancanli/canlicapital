-- Disposable database only; no production connection.
do $$
declare r json;
begin
  perform public.issue_key('tier-client', 5, 'tier-hash', 'tier test');
  r := public.key_tier('tier-hash');
  if not (r->>'known')::boolean or r->>'tier' <> 'free' then raise exception 'new key reads free: %', r; end if;
  if (public.key_tier('nobody')->>'known')::boolean then raise exception 'unknown key known'; end if;
  r := public.set_key_tier('tier-hash', 'sub_test', 'pro', now() + interval '30 days', 'cus_test');
  if (r->>'updated')::int <> 1 then raise exception 'set by key hash: %', r; end if;
  if public.key_tier('tier-hash')->>'tier' <> 'pro' then raise exception 'pro not read'; end if;
  -- Later events find the key by its subscription.
  perform public.set_key_tier(null, 'sub_test', 'team', now() + interval '30 days', null);
  if public.key_tier('tier-hash')->>'tier' <> 'team' then raise exception 'set by subscription'; end if;
  if (select billing_customer from public.api_keys where key_hash = 'tier-hash') <> 'cus_test' then raise exception 'customer kept'; end if;
  -- A lapsed paid tier reads as free; a revoked key has no tier.
  update public.api_keys set tier_until = now() - interval '1 day' where key_hash = 'tier-hash';
  if public.key_tier('tier-hash')->>'tier' <> 'free' then raise exception 'lapsed tier not free'; end if;
  perform public.revoke_key('tier-hash');
  r := public.key_tier('tier-hash');
  if not (r->>'revoked')::boolean or r->>'tier' is not null then raise exception 'revoked key has a tier: %', r; end if;
  begin
    perform public.set_key_tier('tier-hash', null, 'platinum', null, null);
    raise exception 'unknown tier accepted';
  exception when raise_exception then
    if sqlerrm = 'unknown tier accepted' then raise; end if;
  end;
  if (public.set_key_tier(null, 'sub_none', 'pro', null, null)->>'updated')::int <> 0 then raise exception 'unlinked subscription updated a key'; end if;
  if has_function_privilege('anon', 'public.key_tier(text)', 'EXECUTE') or has_function_privilege('authenticated', 'public.set_key_tier(text,text,text,timestamptz,text)', 'EXECUTE') then raise exception 'client role can read or set tiers'; end if;
  if not has_function_privilege('service_role', 'public.set_key_tier(text,text,text,timestamptz,text)', 'EXECUTE') then raise exception 'service role cannot set tiers'; end if;
end $$;
