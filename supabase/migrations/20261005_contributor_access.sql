-- supabase/migrations/20261005_contributor_access.sql
-- Contributor access. A key whose holder has had a contribution merged can be given a higher daily
-- validation limit, and the beta MCP endpoint admits only such keys. The tier lives in its own
-- table keyed by api_keys.id; it is granted, removed and read only through the SECURITY DEFINER
-- functions below, which only the service role may run. Keys without a tier behave exactly as
-- before: same return codes, same counting, same row lock.
--
-- A maintainer names a key the way its holder can without ever sharing it: by its fingerprint,
-- the SHA-256 of the key that api_keys.key_hash already stores (printf '%s' "$CANLI_KEY" |
-- shasum -a 256 prints it, and GET /api/v1/keys/me returns it), or by a label that exactly one
-- active key carries. Both together must agree.
--
-- NOT APPLIED by this change. Depends on 20260905_validation_api.sql (api_keys, api_usage_daily)
-- and 20260920_key_revocation.sql (admission and revocation lock the same key row). Apply it after
-- both and before the API that calls consume_quota_with_limit and read_key_tier is deployed; until
-- it is applied, that API admits validations through consume_quota at the standard limit.
-- Re-applying it is harmless: every statement is idempotent.
begin;

create table if not exists public.key_tiers (
  key_id uuid primary key references public.api_keys(id) on delete cascade,
  tier text not null check (tier = 'contributor'),
  daily_limit integer not null check (daily_limit > 0),
  github_login text not null check (github_login ~ '^[A-Za-z0-9-]{1,39}$'),
  granted_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 500)
);

alter table public.key_tiers enable row level security;
-- No policies on purpose, as on every other table here: anon and authenticated read and write
-- nothing; the functions below run as their owner.
revoke all on public.key_tiers from public, anon, authenticated;

-- The admission, returning the limit it enforced as well as what remains, so the API's
-- X-RateLimit-Limit header and its 429 message state the limit that applied to this key. The tier
-- is read after the key row is locked: granting or removing a tier locks the same row, so an
-- admission sees the tier as of its own turn. The limit is the larger of the caller's limit and
-- the tier's, so a tier can raise a key's limit and never lower it.
create or replace function public.consume_quota_with_limit(p_key_hash text, p_daily_limit integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_id uuid;
  v_tier_limit integer;
  v_limit integer;
  v_calls integer;
begin
  select id into v_key_id from public.api_keys where key_hash = p_key_hash and revoked_at is null for update;
  if v_key_id is null then
    return json_build_object('remaining', -2, 'daily_limit', p_daily_limit);
  end if;
  select daily_limit into v_tier_limit from public.key_tiers where key_id = v_key_id;
  v_limit := greatest(p_daily_limit, v_tier_limit);
  insert into public.api_usage_daily (key_id, day, calls)
    values (v_key_id, (now() at time zone 'utc')::date, 1)
    on conflict (key_id, day) do update set calls = public.api_usage_daily.calls + 1
    returning calls into v_calls;
  update public.api_keys set last_used_at = now() where id = v_key_id;
  if v_calls > v_limit then
    return json_build_object('remaining', -1, 'daily_limit', v_limit);
  end if;
  return json_build_object('remaining', v_limit - v_calls, 'daily_limit', v_limit);
end;
$$;

-- The original admission, same signature and return codes (-2 unknown or revoked, -1 over the
-- limit, otherwise what remains), now through the one implementation above, so a deployment that
-- still calls it honours tiers too.
create or replace function public.consume_quota(p_key_hash text, p_daily_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return (public.consume_quota_with_limit(p_key_hash, p_daily_limit) ->> 'remaining')::integer;
end;
$$;

-- Which key a maintainer means, for grant_key_tier and revoke_key_tier only (no client role and
-- not the service role may call it directly). By fingerprint, any key with that hash, and a label
-- given as well must be that key's; by label alone, the one active key that carries it. Locks the
-- key row it returns. o_reason is null when the key may receive a tier, otherwise unknown_key,
-- ambiguous_label, label_mismatch, revoked_key or no_key_named.
create or replace function public.resolve_tier_key(
  p_key_hash text,
  p_label text,
  out o_key_id uuid,
  out o_key_hash text,
  out o_label text,
  out o_matched_by text,
  out o_reason text
)
language plpgsql
set search_path = public
as $$
declare
  v_revoked_at timestamptz;
  v_active integer := 0;
  v_candidate record;
begin
  if p_key_hash is not null then
    o_matched_by := 'fingerprint';
    select id, key_hash, label, revoked_at into o_key_id, o_key_hash, o_label, v_revoked_at
      from public.api_keys where key_hash = lower(p_key_hash) for update;
    if not found then
      o_reason := 'unknown_key';
    elsif p_label is not null and o_label is distinct from p_label then
      o_reason := 'label_mismatch';
    elsif v_revoked_at is not null then
      o_reason := 'revoked_key';
    end if;
  elsif p_label is not null then
    o_matched_by := 'label';
    -- Lock and count every active key with the label in one pass, so a key issued or revoked
    -- meanwhile cannot slip between the count and the choice.
    for v_candidate in select id, key_hash, label from public.api_keys where label = p_label and revoked_at is null for update loop
      v_active := v_active + 1;
      o_key_id := v_candidate.id;
      o_key_hash := v_candidate.key_hash;
      o_label := v_candidate.label;
    end loop;
    if v_active > 1 then
      o_key_id := null;
      o_key_hash := null;
      o_reason := 'ambiguous_label';
    elsif v_active = 0 then
      o_reason := case when exists (select 1 from public.api_keys where label = p_label) then 'revoked_key' else 'unknown_key' end;
    end if;
  else
    o_reason := 'no_key_named';
  end if;
end;
$$;

-- Grant, or re-grant with new values. A key that cannot be resolved, or is revoked, is refused
-- with a reason rather than an error. Check constraints reject any other tier, a limit below one,
-- a malformed GitHub login and a note over 500 characters.
create or replace function public.grant_key_tier(
  p_tier text,
  p_daily_limit integer,
  p_github_login text,
  p_key_hash text default null,
  p_label text default null,
  p_note text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key record;
  v_row public.key_tiers;
begin
  select * into v_key from public.resolve_tier_key(p_key_hash, p_label);
  if v_key.o_reason is not null then
    return json_build_object('granted', false, 'reason', v_key.o_reason, 'matched_by', v_key.o_matched_by,
      'fingerprint', v_key.o_key_hash, 'label', v_key.o_label);
  end if;
  insert into public.key_tiers as t (key_id, tier, daily_limit, github_login, granted_at, note)
    values (v_key.o_key_id, p_tier, p_daily_limit, p_github_login, now(), p_note)
    on conflict (key_id) do update set
      tier = excluded.tier,
      daily_limit = excluded.daily_limit,
      github_login = excluded.github_login,
      granted_at = excluded.granted_at,
      note = excluded.note
    returning t.* into v_row;
  return json_build_object(
    'granted', true,
    'matched_by', v_key.o_matched_by,
    'fingerprint', v_key.o_key_hash,
    'label', v_key.o_label,
    'tier', v_row.tier,
    'daily_limit', v_row.daily_limit,
    'github_login', v_row.github_login,
    'granted_at', v_row.granted_at,
    'note', v_row.note
  );
end;
$$;

-- Remove a tier. The key keeps working at the standard limit. A revoked key's tier can be removed
-- by fingerprint as well, for tidiness; it was already refused at admission.
create or replace function public.revoke_key_tier(p_key_hash text default null, p_label text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key record;
  v_tier text;
begin
  select * into v_key from public.resolve_tier_key(p_key_hash, p_label);
  if v_key.o_key_id is null or (v_key.o_reason is not null and v_key.o_reason <> 'revoked_key') then
    return json_build_object('revoked', false, 'reason', v_key.o_reason, 'matched_by', v_key.o_matched_by,
      'fingerprint', v_key.o_key_hash, 'label', v_key.o_label);
  end if;
  delete from public.key_tiers where key_id = v_key.o_key_id returning tier into v_tier;
  return json_build_object('revoked', v_tier is not null, 'reason', case when v_tier is null then 'no_tier' end,
    'matched_by', v_key.o_matched_by, 'fingerprint', v_key.o_key_hash, 'label', v_key.o_label);
end;
$$;

-- What GET /api/v1/keys/me and the beta MCP endpoint need for the key presented: its label and
-- tier. NULL for an unknown or revoked key. The caller already holds the key and so its
-- fingerprint; nothing else about the key, and never the GitHub login, is returned.
create or replace function public.read_key_tier(p_key_hash text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'label', k.label,
    'tier', t.tier,
    'daily_limit', t.daily_limit,
    'granted_at', t.granted_at
  )
  from public.api_keys k
  left join public.key_tiers t on t.key_id = k.id
  where k.key_hash = p_key_hash and k.revoked_at is null;
$$;

-- REVOKE FROM PUBLIC alone does not hide a function from anon or authenticated on Supabase, so
-- each role is named, and only the service role may execute the entry points.
revoke all on function public.consume_quota_with_limit(text, integer) from public, anon, authenticated;
grant execute on function public.consume_quota_with_limit(text, integer) to service_role;
revoke all on function public.consume_quota(text, integer) from public, anon, authenticated;
grant execute on function public.consume_quota(text, integer) to service_role;
revoke all on function public.resolve_tier_key(text, text) from public, anon, authenticated, service_role;
revoke all on function public.grant_key_tier(text, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.grant_key_tier(text, integer, text, text, text, text) to service_role;
revoke all on function public.revoke_key_tier(text, text) from public, anon, authenticated;
grant execute on function public.revoke_key_tier(text, text) to service_role;
revoke all on function public.read_key_tier(text) from public, anon, authenticated;
grant execute on function public.read_key_tier(text) to service_role;
commit;
