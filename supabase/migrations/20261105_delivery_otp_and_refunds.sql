-- Customer order care: delivery OTP and auditable refund processing.
-- Database-backed anti-abuse limits for customer tracking and return lookups.
create table if not exists public.tracking_rate_limits (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}-- Apply once in Supabase SQL Editor after the existing store bootstrap/migrations.

alter table public.orders
  add column if not exists delivery_otp_hash text,
  add column if not exists delivery_otp_expires_at timestamptz;

alter table public.return_requests
  add column if not exists refund_reference text,
  add column if not exists refund_method text,
  add column if not exists refund_amount_inr integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'return_requests_refund_amount_check'
      and conrelid = 'public.return_requests'::regclass
  ) then
    alter table public.return_requests
      add constraint return_requests_refund_amount_check
      check (refund_amount_inr is null or refund_amount_inr > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'return_requests_refund_method_check'
      and conrelid = 'public.return_requests'::regclass
  ) then
    alter table public.return_requests
      add constraint return_requests_refund_method_check
      check (refund_method is null or refund_method in ('upi','bank_transfer','cash','original_payment_method'));
  end if;
end $$;

-- Refund completion is an auditable manual confirmation. This does not initiate
-- a bank/UPI/payment-gateway transfer. The store must transfer funds first.
create or replace function public.set_store_return_status(
  p_return_id uuid,
  p_status text,
  p_admin_note text default '',
  p_refund_reference text default null,
  p_refund_method text default null,
  p_refund_amount_inr integer default null
) returns table(request_id uuid, request_status text)
language plpgsql security definer set search_path='' as $$
declare
  v_request public.return_requests%rowtype;
  v_order public.orders%rowtype;
  v_allowed boolean := false;
begin
  if p_status not in ('approved','rejected','received','refunded','exchanged') then
    raise exception 'Unsupported return status';
  end if;

  select * into v_request from public.return_requests where id=p_return_id for update;
  if not found then raise exception 'Return request not found'; end if;

  v_allowed := case
    when v_request.status='requested' then p_status in ('approved','rejected')
    when v_request.status='approved' then p_status in ('received')
    when v_request.status='received' then p_status in ('refunded','exchanged')
    else false
  end;
  if not v_allowed then raise exception 'This return request cannot move to the selected status'; end if;

  select * into v_order from public.orders where id=v_request.order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if p_status='refunded' then
    if length(trim(coalesce(p_refund_reference,''))) < 4 or length(trim(p_refund_reference)) > 120 then
      raise exception 'Enter the actual bank/UPI refund reference before recording a refund';
    end if;
    if coalesce(p_refund_method,'') not in ('upi','bank_transfer','cash','original_payment_method') then
      raise exception 'Choose a valid refund method';
    end if;
    if p_refund_amount_inr is null or p_refund_amount_inr < 1 or p_refund_amount_inr > v_order.total_inr then
      raise exception 'Enter a refund amount between 1 and the order total';
    end if;
  end if;

  update public.return_requests
  set status=p_status,
      admin_note=left(trim(coalesce(p_admin_note,'')),500),
      refund_reference=case when p_status='refunded' then trim(p_refund_reference) else refund_reference end,
      refund_method=case when p_status='refunded' then p_refund_method else refund_method end,
      refund_amount_inr=case when p_status='refunded' then p_refund_amount_inr else refund_amount_inr end,
      processed_at=case when p_status in ('rejected','refunded','exchanged') then now() else processed_at end,
      updated_at=now()
  where id=p_return_id;

  if p_status='refunded' then
    update public.orders set payment_status='refunded', updated_at=now() where id=v_order.id;
  end if;

  return query select p_return_id,p_status;
end;
$$;

revoke all on function public.set_store_return_status(uuid,text,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.set_store_return_status(uuid,text,text,text,text,integer) to service_role;
),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);
alter table public.tracking_rate_limits enable row level security;
revoke all on table public.tracking_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.tracking_rate_limits to service_role;

create or replace function public.consume_tracking_rate_limit(p_ip_hash text)
returns integer
language plpgsql security definer set search_path = ''
as $
declare v_attempts integer;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}-- Apply once in Supabase SQL Editor after the existing store bootstrap/migrations.

alter table public.orders
  add column if not exists delivery_otp_hash text,
  add column if not exists delivery_otp_expires_at timestamptz;

alter table public.return_requests
  add column if not exists refund_reference text,
  add column if not exists refund_method text,
  add column if not exists refund_amount_inr integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'return_requests_refund_amount_check'
      and conrelid = 'public.return_requests'::regclass
  ) then
    alter table public.return_requests
      add constraint return_requests_refund_amount_check
      check (refund_amount_inr is null or refund_amount_inr > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'return_requests_refund_method_check'
      and conrelid = 'public.return_requests'::regclass
  ) then
    alter table public.return_requests
      add constraint return_requests_refund_method_check
      check (refund_method is null or refund_method in ('upi','bank_transfer','cash','original_payment_method'));
  end if;
end $$;

-- Refund completion is an auditable manual confirmation. This does not initiate
-- a bank/UPI/payment-gateway transfer. The store must transfer funds first.
create or replace function public.set_store_return_status(
  p_return_id uuid,
  p_status text,
  p_admin_note text default '',
  p_refund_reference text default null,
  p_refund_method text default null,
  p_refund_amount_inr integer default null
) returns table(request_id uuid, request_status text)
language plpgsql security definer set search_path='' as $$
declare
  v_request public.return_requests%rowtype;
  v_order public.orders%rowtype;
  v_allowed boolean := false;
begin
  if p_status not in ('approved','rejected','received','refunded','exchanged') then
    raise exception 'Unsupported return status';
  end if;

  select * into v_request from public.return_requests where id=p_return_id for update;
  if not found then raise exception 'Return request not found'; end if;

  v_allowed := case
    when v_request.status='requested' then p_status in ('approved','rejected')
    when v_request.status='approved' then p_status in ('received')
    when v_request.status='received' then p_status in ('refunded','exchanged')
    else false
  end;
  if not v_allowed then raise exception 'This return request cannot move to the selected status'; end if;

  select * into v_order from public.orders where id=v_request.order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if p_status='refunded' then
    if length(trim(coalesce(p_refund_reference,''))) < 4 or length(trim(p_refund_reference)) > 120 then
      raise exception 'Enter the actual bank/UPI refund reference before recording a refund';
    end if;
    if p_refund_method not in ('upi','bank_transfer','cash','original_payment_method') then
      raise exception 'Choose a valid refund method';
    end if;
    if p_refund_amount_inr is null or p_refund_amount_inr < 1 or p_refund_amount_inr > v_order.total_inr then
      raise exception 'Enter a refund amount between 1 and the order total';
    end if;
  end if;

  update public.return_requests
  set status=p_status,
      admin_note=left(trim(coalesce(p_admin_note,'')),500),
      refund_reference=case when p_status='refunded' then trim(p_refund_reference) else refund_reference end,
      refund_method=case when p_status='refunded' then p_refund_method else refund_method end,
      refund_amount_inr=case when p_status='refunded' then p_refund_amount_inr else refund_amount_inr end,
      processed_at=case when p_status in ('rejected','refunded','exchanged') then now() else processed_at end,
      updated_at=now()
  where id=p_return_id;

  if p_status='refunded' then
    update public.orders set payment_status='refunded', updated_at=now() where id=v_order.id;
  end if;

  return query select p_return_id,p_status;
end;
$$;

revoke all on function public.set_store_return_status(uuid,text,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.set_store_return_status(uuid,text,text,text,text,integer) to service_role;
 then raise exception 'Invalid tracking rate-limit key'; end if;
  insert into public.tracking_rate_limits as current_limit (ip_hash, window_started_at, attempts)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update
    set window_started_at = case when current_limit.window_started_at <= now() - interval '1 minute' then now() else current_limit.window_started_at end,
        attempts = case when current_limit.window_started_at <= now() - interval '1 minute' then 1 else current_limit.attempts + 1 end
  returning attempts into v_attempts;
  delete from public.tracking_rate_limits where window_started_at < now() - interval '1 day';
  return v_attempts;
end;
$;
revoke all on function public.consume_tracking_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_tracking_rate_limit(text) to service_role;

-- Apply once in Supabase SQL Editor after the existing store bootstrap/migrations.

alter table public.orders
  add column if not exists delivery_otp_hash text,
  add column if not exists delivery_otp_expires_at timestamptz;

alter table public.return_requests
  add column if not exists refund_reference text,
  add column if not exists refund_method text,
  add column if not exists refund_amount_inr integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'return_requests_refund_amount_check'
      and conrelid = 'public.return_requests'::regclass
  ) then
    alter table public.return_requests
      add constraint return_requests_refund_amount_check
      check (refund_amount_inr is null or refund_amount_inr > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'return_requests_refund_method_check'
      and conrelid = 'public.return_requests'::regclass
  ) then
    alter table public.return_requests
      add constraint return_requests_refund_method_check
      check (refund_method is null or refund_method in ('upi','bank_transfer','cash','original_payment_method'));
  end if;
end $$;

-- Refund completion is an auditable manual confirmation. This does not initiate
-- a bank/UPI/payment-gateway transfer. The store must transfer funds first.
create or replace function public.set_store_return_status(
  p_return_id uuid,
  p_status text,
  p_admin_note text default '',
  p_refund_reference text default null,
  p_refund_method text default null,
  p_refund_amount_inr integer default null
) returns table(request_id uuid, request_status text)
language plpgsql security definer set search_path='' as $$
declare
  v_request public.return_requests%rowtype;
  v_order public.orders%rowtype;
  v_allowed boolean := false;
begin
  if p_status not in ('approved','rejected','received','refunded','exchanged') then
    raise exception 'Unsupported return status';
  end if;

  select * into v_request from public.return_requests where id=p_return_id for update;
  if not found then raise exception 'Return request not found'; end if;

  v_allowed := case
    when v_request.status='requested' then p_status in ('approved','rejected')
    when v_request.status='approved' then p_status in ('received')
    when v_request.status='received' then p_status in ('refunded','exchanged')
    else false
  end;
  if not v_allowed then raise exception 'This return request cannot move to the selected status'; end if;

  select * into v_order from public.orders where id=v_request.order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if p_status='refunded' then
    if length(trim(coalesce(p_refund_reference,''))) < 4 or length(trim(p_refund_reference)) > 120 then
      raise exception 'Enter the actual bank/UPI refund reference before recording a refund';
    end if;
    if p_refund_method not in ('upi','bank_transfer','cash','original_payment_method') then
      raise exception 'Choose a valid refund method';
    end if;
    if p_refund_amount_inr is null or p_refund_amount_inr < 1 or p_refund_amount_inr > v_order.total_inr then
      raise exception 'Enter a refund amount between 1 and the order total';
    end if;
  end if;

  update public.return_requests
  set status=p_status,
      admin_note=left(trim(coalesce(p_admin_note,'')),500),
      refund_reference=case when p_status='refunded' then trim(p_refund_reference) else refund_reference end,
      refund_method=case when p_status='refunded' then p_refund_method else refund_method end,
      refund_amount_inr=case when p_status='refunded' then p_refund_amount_inr else refund_amount_inr end,
      processed_at=case when p_status in ('rejected','refunded','exchanged') then now() else processed_at end,
      updated_at=now()
  where id=p_return_id;

  if p_status='refunded' then
    update public.orders set payment_status='refunded', updated_at=now() where id=v_order.id;
  end if;

  return query select p_return_id,p_status;
end;
$$;

revoke all on function public.set_store_return_status(uuid,text,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.set_store_return_status(uuid,text,text,text,text,integer) to service_role;
