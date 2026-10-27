-- supabase/migrations/20261024_cloud_tiers.sql
-- Paid tiers for the hosted MCP server. api_keys.tier already exists (default 'free'); this adds
-- when a paid tier lapses and the billing ids that set it, a check on the tier names, and two RPCs
-- for the service role only: key_tier (read on a keyed request) and set_key_tier (the billing
-- webhook). A revoked key has no tier; a lapsed paid tier reads as free.
begin;

alter table public.api_keys
  add column if not exists tier_until timestamptz,
  add column if not exists billing_customer text check (billing_customer is null or char_length(billing_customer) <= 255),
  add column if not exists billing_subscription text check (billing_subscription is null or char_length(billing_subscription) <= 255);

alter table public.api_keys drop constraint if exists api_keys_tier_check;
alter table public.api_keys add constraint api_keys_tier_check check (tier in ('free', 'pro', 'team', 'enterprise'));

create index if not exists api_keys_billing_subscription_idx on public.api_keys (billing_subscription) where billing_subscription is not null;

create or replace function public.key_tier(p_key_hash text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'known', true,
    'revoked', revoked_at is not null,
    'tier', case when revoked_at is not null then null
                 when tier = 'free' or tier_until is null or tier_until > now() then tier
                 else 'free' end,
    'tier_until', tier_until)
  from public.api_keys where key_hash = p_key_hash
  union all
  select json_build_object('known', false, 'revoked', false, 'tier', null, 'tier_until', null)
  where not exists (select 1 from public.api_keys where key_hash = p_key_hash)
  limit 1;
$$;

-- Sets a key's tier from billing, by key hash or by the subscription that set it before. A revoked
-- key keeps its revocation; its tier is recorded but never read.
create or replace function public.set_key_tier(p_key_hash text, p_subscription text, p_tier text, p_until timestamptz, p_customer text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_tier not in ('free', 'pro', 'team', 'enterprise') then raise exception 'unknown tier %', p_tier; end if;
  update public.api_keys
    set tier = p_tier,
        tier_until = p_until,
        billing_customer = coalesce(p_customer, billing_customer),
        billing_subscription = coalesce(p_subscription, billing_subscription)
    where (p_key_hash is not null and key_hash = p_key_hash)
       or (p_key_hash is null and p_subscription is not null and billing_subscription = p_subscription);
  get diagnostics v_count = row_count;
  return json_build_object('updated', v_count);
end;
$$;

revoke all on function public.key_tier(text) from public, anon, authenticated;
grant execute on function public.key_tier(text) to service_role;
revoke all on function public.set_key_tier(text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.set_key_tier(text, text, text, timestamptz, text) to service_role;
commit;
