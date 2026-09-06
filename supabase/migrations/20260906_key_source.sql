-- supabase/migrations/20260906_key_source.sql
-- Records where a key came from without any tracking parameter: the Referer request header's
-- HOST only (never the path or query), lowercase, or null when the header is missing or cannot be
-- parsed. Adds one nullable column to the table issue_key already writes and extends the RPC to
-- accept it as a fifth, defaulted parameter, so a caller who never sends p_source_host (any
-- existing script, or a stale deployed function version) keeps working unchanged: PostgreSQL
-- resolves CREATE OR REPLACE FUNCTION to the SAME function object, not a new overload, when the
-- only change is appending parameters that all carry a default.
--
-- NOT YET APPLIED. Apply via the Supabase MCP (`apply_migration`) after
-- 20260905_validation_api.sql, before or alongside 20260906_usage_summary_v2.sql (which reads this
-- column). Depends on 20260905_validation_api.sql for public.api_keys and public.issue_key.

alter table public.api_keys add column if not exists source_host text;

create or replace function public.issue_key(
  p_client_hash text,
  p_daily_limit integer,
  p_key_hash text,
  p_label text,
  p_source_host text default null
)
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
  insert into public.api_keys (key_hash, label, source_host) values (p_key_hash, left(p_label, 64), p_source_host);
  return json_build_object('issued', true, 'remaining', p_daily_limit - v_issued);
end;
$$;

revoke all on function public.issue_key(text, integer, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Rollout checklist for whoever applies this (not run by this session; no migration was applied):
--
--   1. apply_migration key_source_v1 (this file).
--   2. Posture mutation test, run as `set local role anon`:
--        select source_host from public.api_keys limit 1;
--      must still fail with 42501 permission denied, exactly as every other column on this table
--      does today; a new column must not open a new read path.
--   3. RPC end-to-end, default role, then cleaned up:
--        issue_key('client-test', 5, 'hash-test', 'plan check', 'github.com')
--          -> {"issued": true, "remaining": 4}
--        issue_key('client-test-2', 5, 'hash-test-2', 'plan check')   -- old 4-arg call, no host
--          -> {"issued": true, "remaining": 4}
--        select source_host from public.api_keys where key_hash in ('hash-test', 'hash-test-2');
--          -> 'github.com', null
-- ---------------------------------------------------------------------------------------------
