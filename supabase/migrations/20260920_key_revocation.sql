-- Release candidate: not applied to production by this change.
-- Both operations lock the key row. Revocation denies subsequent admissions;
-- work admitted before it obtains the lock may still finish.
begin;
create or replace function public.consume_quota(p_key_hash text, p_daily_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_id uuid;
  v_calls integer;
begin
  select id into v_key_id from public.api_keys where key_hash = p_key_hash and revoked_at is null for update;
  if v_key_id is null then
    return -2;
  end if;
  insert into public.api_usage_daily (key_id, day, calls)
    values (v_key_id, (now() at time zone 'utc')::date, 1)
    on conflict (key_id, day) do update set calls = public.api_usage_daily.calls + 1
    returning calls into v_calls;
  update public.api_keys set last_used_at = now() where id = v_key_id;
  if v_calls > p_daily_limit then
    return -1;
  end if;
  return p_daily_limit - v_calls;
end;
$$;


create or replace function public.revoke_key(p_key_hash text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revoked_at timestamptz;
begin
  update public.api_keys
    set revoked_at = coalesce(revoked_at, now())
    where key_hash = p_key_hash
    returning revoked_at into v_revoked_at;
  return json_build_object('revoked', v_revoked_at is not null, 'revoked_at', v_revoked_at);
end;
$$;
revoke all on function public.revoke_key(text) from public, anon, authenticated;
grant execute on function public.revoke_key(text) to service_role;
revoke all on function public.consume_quota(text, integer) from public, anon, authenticated;
grant execute on function public.consume_quota(text, integer) to service_role;
commit;
