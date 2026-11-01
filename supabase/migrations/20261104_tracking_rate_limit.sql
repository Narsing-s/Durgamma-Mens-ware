-- Separate tracking lookups from checkout attempts; allow up to 20 lookups per IP/minute.
create table if not exists public.tracking_rate_limits (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);
alter table public.tracking_rate_limits enable row level security;
revoke all on table public.tracking_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.tracking_rate_limits to service_role;

create or replace function public.consume_tracking_rate_limit(p_ip_hash text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid tracking rate-limit key'; end if;
  insert into public.tracking_rate_limits as current_limit (ip_hash, window_started_at, attempts)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update
    set window_started_at = case
          when current_limit.window_started_at <= now() - interval '1 minute' then now()
          else current_limit.window_started_at
        end,
        attempts = case
          when current_limit.window_started_at <= now() - interval '1 minute' then 1
          else current_limit.attempts + 1
        end
  returning attempts into v_attempts;
  delete from public.tracking_rate_limits where window_started_at < now() - interval '1 day';
  return v_attempts;
end;
$$;
revoke all on function public.consume_tracking_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_tracking_rate_limit(text) to service_role;
