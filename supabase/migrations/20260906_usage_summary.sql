-- supabase/migrations/20260906_usage_summary.sql
-- Adds one read-only aggregate RPC so the owner can see whether anyone is arriving at the
-- validation API, without exposing any per-key or per-client row. Nothing here changes the
-- posture of 20260905_validation_api.sql: RLS stays on with no policies, and this function is
-- reachable only by the service role.

create or replace function public.usage_summary()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'validations_today', coalesce(
      (select sum(calls) from public.api_usage_daily where day = (now() at time zone 'utc')::date),
      0
    ),
    'validations_total', coalesce((select sum(calls) from public.api_usage_daily), 0),
    'keys_issued_today', coalesce(
      (select count(*) from public.api_keys
        where (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date),
      0
    ),
    'as_of_utc_day', (now() at time zone 'utc')::date
  );
$$;

-- REVOKE FROM PUBLIC does not hide an RPC from anon or authenticated: PostgREST resolves those
-- roles independently of PUBLIC, so each is named explicitly, the same posture as consume_quota
-- and issue_key in the prior migration.
revoke all on function public.usage_summary() from public, anon, authenticated;
