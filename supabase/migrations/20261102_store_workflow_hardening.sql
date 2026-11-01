-- Enforce a one-way fulfilment lifecycle and preserve the original delivery timestamp.
-- Apply after 20261101_real_store_operations.sql.

create or replace function public.set_store_order_status(
  p_order_id uuid,
  p_status text,
  p_note text default ''
) returns table(order_number text, order_status text)
language plpgsql security definer set search_path='' as $$
declare
  v_order public.orders%rowtype;
  v_allowed boolean := false;
begin
  if p_status not in ('pending','confirmed','packed','shipped','delivered','cancelled') then
    raise exception 'Unsupported order status';
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if v_order.order_status=p_status then
    return query select v_order.order_number,v_order.order_status;
    return;
  end if;

  v_allowed := case
    when v_order.order_status='pending' then p_status in ('confirmed','cancelled')
    when v_order.order_status='confirmed' then p_status in ('packed','cancelled')
    when v_order.order_status='packed' then p_status in ('shipped','cancelled')
    when v_order.order_status='shipped' then p_status='delivered'
    else false
  end;

  if not v_allowed then
    raise exception 'Invalid order transition: % to %',v_order.order_status,p_status;
  end if;

  if p_status='cancelled' then
    update public.product_variants as variants
    set stock=variants.stock+items.quantity
    from public.order_items as items
    where items.order_id=v_order.id and variants.id=items.variant_id;
  end if;

  update public.orders
  set order_status=p_status,
      admin_note=left(coalesce(p_note,''),1000),
      cancelled_at=case when p_status='cancelled' then now() else cancelled_at end,
      delivered_at=case when p_status='delivered' then now() else delivered_at end,
      updated_at=now()
  where id=v_order.id;

  insert into public.order_status_events(order_id,status,note)
  values(v_order.id,p_status,left(coalesce(p_note,''),1000));

  return query select v_order.order_number,p_status;
end;
$$;

revoke all on function public.set_store_order_status(uuid,text,text) from public;
grant execute on function public.set_store_order_status(uuid,text,text) to service_role;
