-- Release reserved inventory when an online payment is abandoned or fails.
-- Safe to run repeatedly in Supabase SQL Editor.
create or replace function public.cancel_unpaid_store_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  -- Never release inventory for COD, captured payments, or an already cancelled order.
  if v_order.payment_method <> 'online'
     or v_order.payment_status = 'paid'
     or v_order.order_status = 'cancelled' then
    return false;
  end if;

  update public.product_variants as variants
  set stock = variants.stock + items.quantity
  from public.order_items as items
  where items.order_id = p_order_id
    and variants.id = items.variant_id;

  update public.orders
  set payment_status = 'failed',
      order_status = 'cancelled',
      updated_at = now()
  where id = p_order_id;

  return true;
end;
$$;

revoke all on function public.cancel_unpaid_store_order(uuid) from public;
grant execute on function public.cancel_unpaid_store_order(uuid) to service_role;
