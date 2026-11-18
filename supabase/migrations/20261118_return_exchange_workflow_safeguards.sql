-- Return/exchange workflow safeguards and auditable status corrections.
-- Additive only: preserves all orders and return_requests rows.

create table if not exists public.return_request_status_events (
  id uuid primary key default gen_random_uuid(),
  return_request_id uuid not null references public.return_requests(id) on delete restrict,
  from_status text,
  to_status text not null,
  event_note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists return_request_status_events_request_created_idx
  on public.return_request_status_events(return_request_id, created_at desc);
alter table public.return_request_status_events enable row level security;
revoke all on table public.return_request_status_events from public, anon, authenticated;
grant select, insert on table public.return_request_status_events to service_role;

insert into public.return_request_status_events(return_request_id, from_status, to_status, event_note, created_at)
select r.id, null, r.status, 'Status history initialized', coalesce(r.updated_at, r.created_at, now())
from public.return_requests r
where not exists (select 1 from public.return_request_status_events e where e.return_request_id = r.id);

create or replace function public.set_store_return_status(
  p_return_id uuid, p_status text, p_admin_note text default '',
  p_refund_reference text default null, p_refund_method text default null,
  p_refund_amount_inr integer default null
) returns table(request_id uuid, request_status text)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_request public.return_requests%rowtype;
  v_order public.orders%rowtype;
  v_allowed boolean := false;
  v_refund_cap integer;
begin
  if p_status not in ('approved','rejected','received','refunded','exchanged') then raise exception 'Unsupported return status'; end if;
  select * into v_request from public.return_requests where id = p_return_id for update;
  if not found then raise exception 'Return request not found'; end if;

  if v_request.request_type = 'return' and p_status = 'exchanged' then
    raise exception 'A RETURN request cannot be marked EXCHANGED.';
  end if;
  if v_request.request_type = 'exchange' and p_status = 'refunded' then
    raise exception 'An EXCHANGE request cannot be marked REFUNDED.';
  end if;

  v_allowed := case
    when v_request.status = 'requested' then p_status in ('approved','rejected')
    when v_request.status = 'approved' then p_status = 'received'
    when v_request.status = 'received' then
      (v_request.request_type = 'return' and p_status = 'refunded')
      or (v_request.request_type = 'exchange' and p_status = 'exchanged')
    else false
  end;
  if not v_allowed then raise exception 'This request cannot move from % to %', v_request.status, p_status; end if;

  select * into v_order from public.orders where id = v_request.order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if p_status = 'refunded' then
    if length(trim(coalesce(p_refund_reference,''))) < 4 or length(trim(p_refund_reference)) > 120 then
      raise exception 'Enter the actual bank/UPI refund reference before recording a refund';
    end if;
    if coalesce(p_refund_method,'') not in ('upi','bank_transfer','cash','original_payment_method') then
      raise exception 'Choose a valid refund method';
    end if;
    if v_request.order_item_id is not null then
      select line_total_inr into v_refund_cap from public.order_items where id = v_request.order_item_id;
    else v_refund_cap := v_order.total_inr; end if;
    if p_refund_amount_inr is null or p_refund_amount_inr < 1 or p_refund_amount_inr > v_refund_cap then
      raise exception 'Enter a refund amount up to the selected product total';
    end if;
  end if;

  update public.return_requests
  set status = p_status, admin_note = left(trim(coalesce(p_admin_note,'')),500),
      refund_reference = case when p_status = 'refunded' then trim(p_refund_reference) else refund_reference end,
      refund_method = case when p_status = 'refunded' then p_refund_method else refund_method end,
      refund_amount_inr = case when p_status = 'refunded' then p_refund_amount_inr else refund_amount_inr end,
      processed_at = case when p_status in ('rejected','refunded','exchanged') then now() else processed_at end,
      updated_at = now()
  where id = p_return_id;

  insert into public.return_request_status_events(return_request_id, from_status, to_status, event_note)
  values (p_return_id, v_request.status, p_status, left(trim(coalesce(p_admin_note,'')),500));

  if p_status = 'refunded' and p_refund_amount_inr >= v_order.total_inr then
    update public.orders set payment_status = 'refunded', updated_at = now() where id = v_order.id;
  end if;
  return query select p_return_id, p_status;
end;
$function$;
revoke all on function public.set_store_return_status(uuid,text,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.set_store_return_status(uuid,text,text,text,text,integer) to service_role;

create or replace function public.correct_store_return_exchange_mistake(
  p_return_id uuid,
  p_admin_note text default 'Corrected accidental EXCHANGED status on a RETURN request'
) returns table(request_id uuid, request_status text)
language plpgsql security definer set search_path = ''
as $function$
declare v_request public.return_requests%rowtype;
begin
  select * into v_request from public.return_requests where id = p_return_id for update;
  if not found then raise exception 'Return request not found'; end if;
  if v_request.request_type <> 'return' or v_request.status <> 'exchanged' then
    raise exception 'Only a RETURN request incorrectly marked EXCHANGED can be corrected this way';
  end if;
  update public.return_requests
  set status = 'received', processed_at = null,
      admin_note = left(trim(coalesce(p_admin_note,'')),500), updated_at = now()
  where id = p_return_id;
  insert into public.return_request_status_events(return_request_id, from_status, to_status, event_note)
  values (p_return_id, 'exchanged', 'received', left(trim(coalesce(p_admin_note,'')),500));
  return query select p_return_id, 'received'::text;
end;
$function$;
revoke all on function public.correct_store_return_exchange_mistake(uuid,text) from public, anon, authenticated;
grant execute on function public.correct_store_return_exchange_mistake(uuid,text) to service_role;
