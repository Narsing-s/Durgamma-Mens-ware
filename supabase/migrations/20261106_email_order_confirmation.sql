-- Customer-controlled final confirmation for COD orders.
alter table public.orders
  add column if not exists confirmation_token_hash text,
  add column if not exists confirmation_expires_at timestamptz,
  add column if not exists confirmation_decided_at timestamptz;

create unique index if not exists orders_confirmation_token_hash_uidx
  on public.orders(confirmation_token_hash)
  where confirmation_token_hash is not null;

create or replace function public.resolve_store_order_confirmation(
  p_token_hash text,
  p_action text
) returns table(order_number text, order_status text, customer_email text, customer_name text, total_inr integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'This confirmation link is invalid';
  end if;
  if p_action not in ('confirm','cancel') then
    raise exception 'Choose confirm or cancel';
  end if;

  select * into v_order
  from public.orders
  where confirmation_token_hash = p_token_hash
  for update;

  if not found then raise exception 'This confirmation link is invalid or already used'; end if;
  if v_order.confirmation_expires_at is null or v_order.confirmation_expires_at <= now() then
    raise exception 'This confirmation link has expired';
  end if;
  if v_order.order_status <> 'pending' or v_order.confirmation_decided_at is not null then
    raise exception 'This order has already been finalized';
  end if;

  if p_action = 'confirm' then
    perform public.set_store_order_status(v_order.id, 'confirmed', 'Customer confirmed the order using the secure email link.');
  else
    perform public.set_store_order_status(v_order.id, 'cancelled', 'Customer cancelled the order using the secure email link. Reserved stock was restored.');
  end if;

  update public.orders
  set confirmation_decided_at = now(),
      confirmation_token_hash = null,
      confirmation_expires_at = null,
      updated_at = now()
  where id = v_order.id;

  return query select v_order.order_number, case when p_action = 'confirm' then 'confirmed' else 'cancelled' end,
    v_order.email, v_order.customer_name, v_order.total_inr;
end;
$function$;

revoke all on function public.resolve_store_order_confirmation(text,text) from public, anon, authenticated;
grant execute on function public.resolve_store_order_confirmation(text,text) to service_role;
