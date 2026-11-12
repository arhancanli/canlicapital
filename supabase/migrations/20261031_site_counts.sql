-- One number per anonymous action per day. No cookies, identifiers, addresses or text: see /privacy.
create table if not exists public.site_counts (
  day date not null default (now() at time zone 'utc')::date,
  action text not null,
  n bigint not null default 0,
  primary key (day, action)
);
alter table public.site_counts enable row level security;

create or replace function public.count_site_action(what text)
returns void language sql security definer set search_path = '' as $$
  insert into public.site_counts (action, n) values (what, 1)
  on conflict (day, action) do update set n = public.site_counts.n + 1;
$$;
revoke all on function public.count_site_action(text) from public, anon, authenticated;
grant execute on function public.count_site_action(text) to service_role;
