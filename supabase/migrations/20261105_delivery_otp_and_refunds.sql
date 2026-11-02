-- Customer order care: tracking protection, delivery OTP and item-level returns/refunds.
-- Apply once in Supabase SQL Editor after the existing store bootstrap/migrations.

-- Supabase-backed rate limiting for customer tracking and return lookups.
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
as $function$
declare
  v_attempts integer;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid tracking rate-limit key';
  end if;
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
  delete from public.tracking_rate_limits
  where window_started_at < now() - interval '1 day';
  return v_attempts;
end;
$function$;
revoke all on function public.consume_tracking_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_tracking_rate_limit(text) to service_role;

-- Expiring OTPs are hashed with a server-only HMAC before they are stored.
alter table public.orders
  add column if not exists delivery_otp_hash text,
  add column if not exists delivery_otp_expires_at timestamptz;

-- Return requests can target a specific line item. Existing requests remain valid
-- with order_item_id NULL and retain order-level semantics.
alter table public.return_requests
  add column if not exists order_item_id uuid references public.order_items(id),
  add column if not exists refund_reference text,
  add column if not exists refund_method text,
  add column if not exists refund_amount_inr integer;

do $function$
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
end;
$function$;

-- One active request per selected product line; legacy whole-order requests
-- continue to be protected by a separate partial unique index.
drop index if exists public.one_active_return_request_per_order;
create unique index if not exists one_active_return_request_per_order_item
  on public.return_requests(order_id, order_item_id)
  where status in ('requested','approved','received') and order_item_id is not null;
create unique index if not exists one_active_return_request_per_order_legacy
  on public.return_requests(order_id)
  where status in ('requested','approved','received') and order_item_id is null;

-- Replace the earlier token-only RPC with an item-scoped request.
drop function if exists public.create_store_return_request(text,text,text,text);
create or replace function public.create_store_return_request(
  p_tracking_token_hash text,
  p_request_type text,
  p_reason text,
  p_customer_note text,
  p_order_item_id uuid
) returns table(request_id uuid, request_status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_request_id uuid := gen_random_uuid();
begin
  if p_tracking_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid tracking link';
  end if;
  if p_request_type not in ('return','exchange') then
    raise exception 'Choose return or exchange';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 500 then
    raise exception 'Please provide a reason between 5 and 500 characters';
  end if;

  select * into v_order
  from public.orders
  where tracking_token_hash = p_tracking_token_hash
  for update;
  if not found then raise exception 'Invalid tracking link'; end if;
  if v_order.order_status <> 'delivered' or v_order.delivered_at is null then
    raise exception 'Returns and exchanges are available after delivery';
  end if;
  if v_order.delivered_at < now() - interval '7 days' then
    raise exception 'The 7-day return/exchange period has ended';
  end if;

  if p_order_item_id is not null then
    select * into v_item
    from public.order_items
    where id = p_order_item_id and order_id = v_order.id;
    if not found then
      raise exception 'Selected product does not belong to this order';
    end if;
  end if;

  insert into public.return_requests(
    id, order_id, order_item_id, reason, request_type, customer_note, status
  ) values (
    v_request_id, v_order.id, p_order_item_id, trim(p_reason), p_request_type,
    left(trim(coalesce(p_customer_note,'')),500), 'requested'
  );

  return query select v_request_id, 'requested'::text;
exception
  when unique_violation then
    raise exception 'An active return or exchange request already exists for this product';
end;
$function$;
revoke all on function public.create_store_return_request(text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.create_store_return_request(text,text,text,text,uuid) to service_role;

-- Refund completion is an auditable manual confirmation. It does not initiate
-- a bank/UPI/payment-gateway transfer. The store must transfer funds first.
drop function if exists public.set_store_return_status(uuid,text,text);
create or replace function public.set_store_return_status(
  p_return_id uuid,
  p_status text,
  p_admin_note text default '',
  p_refund_reference text default null,
  p_refund_method text default null,
  p_refund_amount_inr integer default null
) returns table(request_id uuid, request_status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request public.return_requests%rowtype;
  v_order public.orders%rowtype;
  v_allowed boolean := false;
  v_refund_cap integer;
begin
  if p_status not in ('approved','rejected','received','refunded','exchanged') then
    raise exception 'Unsupported return status';
  end if;

  select * into v_request
  from public.return_requests
  where id = p_return_id
  for update;
  if not found then raise exception 'Return request not found'; end if;

  v_allowed := case
    when v_request.status = 'requested' then p_status in ('approved','rejected')
    when v_request.status = 'approved' then p_status = 'received'
    when v_request.status = 'received' then p_status in ('refunded','exchanged')
    else false
  end;
  if not v_allowed then
    raise exception 'This return request cannot move to the selected status';
  end if;

  select * into v_order
  from public.orders
  where id = v_request.order_id
  for update;
  if not found then raise exception 'Order not found'; end if;

  if p_status = 'refunded' then
    if length(trim(coalesce(p_refund_reference,''))) < 4
       or length(trim(p_refund_reference)) > 120 then
      raise exception 'Enter the actual bank/UPI refund reference before recording a refund';
    end if;
    if coalesce(p_refund_method,'') not in ('upi','bank_transfer','cash','original_payment_method') then
      raise exception 'Choose a valid refund method';
    end if;
    if v_request.order_item_id is not null then
      select line_total_inr into v_refund_cap
      from public.order_items where id = v_request.order_item_id;
    else
      v_refund_cap := v_order.total_inr;
    end if;
    if p_refund_amount_inr is null
       or p_refund_amount_inr < 1
       or p_refund_amount_inr > v_refund_cap then
      raise exception 'Enter a refund amount up to the selected product total';
    end if;
  end if;

  update public.return_requests
  set status = p_status,
      admin_note = left(trim(coalesce(p_admin_note,'')),500),
      refund_reference = case when p_status = 'refunded' then trim(p_refund_reference) else refund_reference end,
      refund_method = case when p_status = 'refunded' then p_refund_method else refund_method end,
      refund_amount_inr = case when p_status = 'refunded' then p_refund_amount_inr else refund_amount_inr end,
      processed_at = case when p_status in ('rejected','refunded','exchanged') then now() else processed_at end,
      updated_at = now()
  where id = p_return_id;

  if p_status = 'refunded' and p_refund_amount_inr >= v_order.total_inr then
    update public.orders
    set payment_status = 'refunded', updated_at = now()
    where id = v_order.id;
  end if;

  return query select p_return_id, p_status;
end;
$function$;

revoke all on function public.set_store_return_status(uuid,text,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.set_store_return_status(uuid,text,text,text,text,integer) to service_role;
