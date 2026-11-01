-- Real-store operations upgrade for Durgamma Menswear
-- Apply after supabase/schema.sql and existing migrations.

alter table public.orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists admin_note text not null default '';

create table if not exists public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null check(status in ('pending','confirmed','packed','shipped','delivered','cancelled')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists order_status_events_order_created_idx
  on public.order_status_events(order_id, created_at desc);

alter table public.order_status_events enable row level security;

create table if not exists public.delivery_pincodes (
  pincode text primary key check(pincode ~ '^[1-9][0-9]{5}$'),
  is_serviceable boolean not null default true,
  shipping_inr integer not null default 99 check(shipping_inr >= 0),
  min_delivery_days integer check(min_delivery_days is null or min_delivery_days >= 0),
  max_delivery_days integer check(max_delivery_days is null or max_delivery_days >= min_delivery_days),
  updated_at timestamptz not null default now()
);

alter table public.delivery_pincodes enable row level security;

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  reason text not null check(length(trim(reason)) between 5 and 500),
  status text not null default 'requested'
    check(status in ('requested','approved','rejected','received','refunded','exchanged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.return_requests enable row level security;

drop trigger if exists return_requests_set_updated_at on public.return_requests;
create trigger return_requests_set_updated_at
before update on public.return_requests
for each row execute function public.set_updated_at();

-- Trusted owner/server operation. Cancelling an order restores inventory exactly once.
create or replace function public.set_store_order_status(
  p_order_id uuid,
  p_status text,
  p_note text default ''
) returns table(order_number text, order_status text)
language plpgsql security definer set search_path='' as $$
declare
  v_order public.orders%rowtype;
begin
  if p_status not in ('pending','confirmed','packed','shipped','delivered','cancelled') then
    raise exception 'Unsupported order status';
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if v_order.order_status='cancelled' and p_status<>'cancelled' then
    raise exception 'Cancelled orders cannot be reopened';
  end if;

  if v_order.order_status='delivered' and p_status='cancelled' then
    raise exception 'Delivered orders cannot be cancelled';
  end if;

  if p_status='cancelled' and v_order.order_status<>'cancelled' then
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
