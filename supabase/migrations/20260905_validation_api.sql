-- supabase/migrations/20260905_validation_api.sql
-- Validation API store. Every table has RLS ON with NO policies: nothing reads or writes except
-- the service role from the Vercel function, and every write goes through the two RPCs below.
create extension if not exists pgcrypto;

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  label text check (label is null or char_length(label) <= 64),
  tier text not null default 'free',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.api_usage_daily (
  key_id uuid not null references public.api_keys(id) on delete cascade,
  day date not null,
  calls integer not null default 0,
  primary key (key_id, day)
);

create table if not exists public.api_key_issuance (
  client_hash text not null,
  day date not null,
  issued integer not null default 0,
  primary key (client_hash, day)
);

create table if not exists public.receipts (
  id text primary key check (id ~ '^[0-9a-f]{24}$'),
  key_id uuid references public.api_keys(id) on delete set null,
  endpoint text not null,
  input_sha256 text not null,
  output jsonb not null,
  bindings jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists receipts_created_at_idx on public.receipts (created_at);

alter table public.api_keys enable row level security;
alter table public.api_usage_daily enable row level security;
alter table public.api_key_issuance enable row level security;
alter table public.receipts enable row level security;
-- No policies on purpose: anon and authenticated see nothing; the service role bypasses RLS.

revoke all on public.api_keys, public.api_usage_daily, public.api_key_issuance, public.receipts from anon, authenticated;

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
  select id into v_key_id from public.api_keys where key_hash = p_key_hash and revoked_at is null;
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

create or replace function public.issue_key(p_client_hash text, p_daily_limit integer, p_key_hash text, p_label text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issued integer;
begin
  insert into public.api_key_issuance (client_hash, day, issued)
    values (p_client_hash, (now() at time zone 'utc')::date, 1)
    on conflict (client_hash, day) do update set issued = public.api_key_issuance.issued + 1
    returning issued into v_issued;
  if v_issued > p_daily_limit then
    return json_build_object('issued', false, 'remaining', 0);
  end if;
  insert into public.api_keys (key_hash, label) values (p_key_hash, left(p_label, 64));
  return json_build_object('issued', true, 'remaining', p_daily_limit - v_issued);
end;
$$;

revoke all on function public.consume_quota(text, integer) from public, anon, authenticated;
revoke all on function public.issue_key(text, integer, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Applied 2026-09-05 to project bpnensyowfmdwhqmfdrg (eu-central-1) via the Supabase MCP
-- (`apply_migration validation_api_v1`): success.
--
-- Posture mutation test, run as `set local role anon`:
--   select count(*) from public.api_keys  ->  ERROR 42501 permission denied for table api_keys
--   (the REVOKE bites before RLS is even consulted; the anon role reads nothing).
--
-- RPC end-to-end, default role, then cleaned up:
--   issue_key('client-test', 5, 'hash-test', 'plan check') -> {"issued": true, "remaining": 4}
--   consume_quota('hash-test', 2) x3                       -> 1, 0, -1
--   consume_quota('unknown', 2)                            -> -2
--   after cleanup: api_keys 0, api_key_issuance 0, api_usage_daily 0, receipts 0
-- ---------------------------------------------------------------------------------------------
