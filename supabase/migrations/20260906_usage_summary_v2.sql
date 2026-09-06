-- supabase/migrations/20260906_usage_summary_v2.sql
-- Replaces public.usage_summary() (20260906_usage_summary.sql) to add two small aggregate maps,
-- so the owner can see WHERE arrivals come from without any tracking parameter and without
-- exposing a single per-key or per-client row: the top ten source hosts (from source_host, added
-- by 20260906_key_source.sql) and the top ten integration labels (from the existing label column)
-- among keys issued today. Same posture as every migration before it: RLS stays on with no
-- policies, and this function is reachable only by the service role.
--
-- Depends on 20260906_key_source.sql for api_keys.source_host. Apply that migration first, or
-- the source_host reference below fails at CREATE time.
--
-- NOT YET APPLIED. Apply via the Supabase MCP (`apply_migration`) after 20260906_key_source.sql.

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
    'as_of_utc_day', (now() at time zone 'utc')::date,
    'keys_by_source_host_today', coalesce(
      (select json_object_agg(bucket, host_count) from (
        select coalesce(source_host, 'unknown') as bucket, count(*) as host_count
        from public.api_keys
        where (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date
        group by bucket
        order by host_count desc
        limit 10
      ) top_hosts),
      '{}'::json
    ),
    'keys_by_label_today', coalesce(
      (select json_object_agg(bucket, label_count) from (
        select coalesce(label, 'unlabeled') as bucket, count(*) as label_count
        from public.api_keys
        where (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date
        group by bucket
        order by label_count desc
        limit 10
      ) top_labels),
      '{}'::json
    )
  );
$$;

revoke all on function public.usage_summary() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Rollout checklist for whoever applies this (not run by this session; no migration was applied):
--
--   1. Confirm 20260906_key_source.sql is applied first (api_keys.source_host must exist).
--   2. apply_migration usage_summary_v2 (this file). CREATE OR REPLACE keeps the same zero-arg
--      signature, so this is a straight replace, not a new overload.
--   3. Posture check: usage_summary() still returns zero rows of per-key detail, only aggregates
--      and two small maps capped at ten entries each; anon and authenticated still cannot call it
--      (unchanged revoke list) and still cannot read api_keys directly.
--   4. Smoke: scripts/smoke-validation-api.mjs asserts keys_by_source_host_today and
--      keys_by_label_today are present as object maps whenever usage is non-null.
-- ---------------------------------------------------------------------------------------------
