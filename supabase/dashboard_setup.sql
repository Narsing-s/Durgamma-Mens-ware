-- Durgamma Menswear: complete Supabase database bootstrap
-- Target project: eagypnbynfbimurcpxrw
-- Run this entire file ONCE in Supabase Dashboard > SQL Editor.
-- Safe for an existing installation: uses IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.
-- Review your existing schema first. Do not run on a different project.
--
-- This creates the app's products, variants, orders, order items, payment event,
-- order tracking, order history, inventory audit, delivery PIN codes and returns.
-- It also installs the required RPCs, triggers, indexes, RLS and product image bucket.
--
-- IMPORTANT DATA NOTE:
-- No fake products, prices, SKUs, inventory, customer orders, or serviceable PIN codes
-- are inserted. Those are real business data and must be entered by the store owner.
-- After this script, add actual products and size/colour stock in the owner dashboard,
-- and add PIN codes you really serve in public.delivery_pincodes.
--
-- The 20261102 migrations are included because they are already part of the repository's
-- current main branch and provide the current product-media/returns/workflow features.
--


-- =====================================================================
-- SOURCE: supabase/schema.sql
-- =====================================================================

-- Durgamma Menswear production data foundation (Supabase / PostgreSQL)
-- Apply only after creating a Supabase project and reviewing the policies below.
create extension if not exists pgcrypto;
create table if not exists public.products (
 id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
 description text not null default '', category text not null, price_inr integer not null check(price_inr>=0),
 compare_at_price_inr integer check(compare_at_price_inr is null or compare_at_price_inr>=price_inr),
 image_url text, is_active boolean not null default false, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.product_variants (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
 sku text not null unique, size text not null, colour text not null default 'Default',
 stock integer not null default 0 check(stock>=0), is_active boolean not null default true,
 created_at timestamptz not null default now(), unique(product_id,size,colour)
);
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(), order_number text not null unique,
 customer_name text not null, email text not null, phone text not null, shipping_address jsonb not null,
 payment_method text not null check(payment_method in ('online','cod')),
 order_status text not null default 'pending' check(order_status in ('pending','confirmed','packed','shipped','delivered','cancelled')),
 payment_status text not null default 'pending' check(payment_status in ('pending','paid','cod_due','refunded','failed')),
 razorpay_order_id text unique, razorpay_payment_id text unique,
 subtotal_inr integer not null check(subtotal_inr>=0), shipping_inr integer not null check(shipping_inr>=0),
 total_inr integer not null check(total_inr=subtotal_inr+shipping_inr),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
 product_id uuid not null references public.products(id), variant_id uuid not null references public.product_variants(id),
 product_name text not null, sku text not null, size text not null, colour text not null,
 unit_price_inr integer not null check(unit_price_inr>=0), quantity integer not null check(quantity between 1 and 10),
 line_total_inr integer not null check(line_total_inr=unit_price_inr*quantity)
);
create index if not exists products_active_category_idx on public.products(category) where is_active=true;
create index if not exists variants_product_active_idx on public.product_variants(product_id) where is_active=true;
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_email_idx on public.orders(email);
create index if not exists order_items_order_idx on public.order_items(order_id);
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
drop policy if exists "Public can view active products" on public.products;
create policy "Public can view active products" on public.products for select to anon,authenticated using(is_active=true);
drop policy if exists "Public can view active variants" on public.product_variants;
create policy "Public can view active variants" on public.product_variants for select to anon,authenticated using(is_active=true and exists(select 1 from public.products p where p.id=product_id and p.is_active=true));
-- Orders and order_items intentionally have no public policies.
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end; $$;
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();
-- Atomic stock reservation. Browser-supplied prices are never trusted.
create or replace function public.create_store_order(
 p_customer_name text,p_email text,p_phone text,p_shipping_address jsonb,p_payment_method text,p_items jsonb
) returns table(order_id uuid,order_number text,subtotal_inr integer,shipping_inr integer,total_inr integer)
language plpgsql security definer set search_path='' as $$
declare
 v_order_id uuid:=gen_random_uuid();
 v_order_number text:='DMW-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 v_subtotal integer:=0; v_shipping integer:=0; v_item jsonb;
 v_variant public.product_variants%rowtype; v_product public.products%rowtype;
 v_qty integer; v_line integer; v_lines jsonb:='[]'::jsonb;
begin
 if length(trim(coalesce(p_customer_name,''))) not between 2 and 100 then raise exception 'Invalid customer name'; end if;
 if length(trim(coalesce(p_email,'')))>254 or position('@' in coalesce(p_email,''))<2 then raise exception 'Invalid email'; end if;
 if length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) not between 10 and 15 then raise exception 'Invalid phone number'; end if;
 if p_payment_method is null or p_payment_method not in ('online','cod') then raise exception 'Unsupported payment method'; end if;
 if coalesce(jsonb_typeof(p_shipping_address),'')<>'object' or coalesce(jsonb_typeof(p_items),'')<>'array' or coalesce(jsonb_array_length(p_items),0) not between 1 and 20 then raise exception 'Invalid address or cart'; end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_qty:=(v_item->>'quantity')::integer;
  if v_qty not between 1 and 10 then raise exception 'Invalid item quantity'; end if;
  select * into v_variant from public.product_variants where id=(v_item->>'variant_id')::uuid and is_active=true for update;
  if not found then raise exception 'A selected size is unavailable'; end if;
  if v_variant.stock<v_qty then raise exception 'Insufficient stock for SKU %',v_variant.sku; end if;
  select * into v_product from public.products where id=v_variant.product_id and is_active=true;
  if not found then raise exception 'A selected product is unavailable'; end if;
  v_line:=v_product.price_inr*v_qty; v_subtotal:=v_subtotal+v_line;
  update public.product_variants set stock=stock-v_qty where id=v_variant.id;
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object('product_id',v_product.id,'variant_id',v_variant.id,'product_name',v_product.name,'sku',v_variant.sku,'size',v_variant.size,'colour',v_variant.colour,'unit_price_inr',v_product.price_inr,'quantity',v_qty,'line_total_inr',v_line));
 end loop;
 v_shipping:=case when v_subtotal>=1999 then 0 else 99 end;
 insert into public.orders(id,order_number,customer_name,email,phone,shipping_address,payment_method,payment_status,subtotal_inr,shipping_inr,total_inr)
 values(v_order_id,v_order_number,trim(p_customer_name),lower(trim(p_email)),trim(p_phone),p_shipping_address,p_payment_method,
 case when p_payment_method='cod' then 'cod_due' else 'pending' end,v_subtotal,v_shipping,v_subtotal+v_shipping);
 insert into public.order_items(order_id,product_id,variant_id,product_name,sku,size,colour,unit_price_inr,quantity,line_total_inr)
 select v_order_id,(item->>'product_id')::uuid,(item->>'variant_id')::uuid,item->>'product_name',item->>'sku',item->>'size',item->>'colour',(item->>'unit_price_inr')::integer,(item->>'quantity')::integer,(item->>'line_total_inr')::integer
 from jsonb_array_elements(v_lines) as line(item);
 return query select v_order_id,v_order_number,v_subtotal,v_shipping,v_subtotal+v_shipping;
end; $$;
revoke all on function public.create_store_order(text,text,text,jsonb,text,jsonb) from public;
-- Grant only after a trusted, rate-limited server API is implemented and reviewed.

-- Webhook idempotency: a provider event can only be processed once.
create table if not exists public.payment_webhook_events (
 event_id text primary key, provider text not null check(provider='razorpay'), received_at timestamptz not null default now()
);
alter table public.payment_webhook_events enable row level security;
-- Trusted server routes use the service role only. Never expose this key in the browser.
grant execute on function public.create_store_order(text,text,text,jsonb,text,jsonb) to service_role;


-- Release reserved inventory when an online payment is abandoned or fails.
create or replace function public.cancel_unpaid_store_order(p_order_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype;
begin
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then return false; end if;
 if v_order.payment_method<>'online' or v_order.payment_status='paid' or v_order.order_status='cancelled' then return false; end if;
 update public.product_variants as variants set stock=variants.stock+items.quantity
 from public.order_items as items where items.order_id=p_order_id and variants.id=items.variant_id;
 update public.orders set payment_status='failed',order_status='cancelled',updated_at=now() where id=p_order_id;
 return true;
end; $$;
revoke all on function public.cancel_unpaid_store_order(uuid) from public;
grant execute on function public.cancel_unpaid_store_order(uuid) to service_role;



-- =====================================================================
-- SOURCE: supabase/migrations/20261030_payment_recovery.sql
-- =====================================================================

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



-- =====================================================================
-- SOURCE: supabase/migrations/20261031_secure_order_tracking.sql
-- =====================================================================

-- Secure customer order tracking without exposing customer PII.
-- Apply this migration in the Supabase SQL editor before deploying the tracking feature.
alter table public.orders
  add column if not exists tracking_token_hash text;

create unique index if not exists orders_tracking_token_hash_uidx
  on public.orders(tracking_token_hash)
  where tracking_token_hash is not null;

comment on column public.orders.tracking_token_hash is
  'SHA-256 hash of a one-time high-entropy customer tracking token. Raw token is returned once at checkout and never stored.';



-- =====================================================================
-- SOURCE: supabase/migrations/20261101_real_store_operations.sql
-- =====================================================================

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



-- =====================================================================
-- SOURCE: supabase/migrations/20261101_inventory_audit.sql
-- =====================================================================

-- Owner inventory controls with an audit trail.
create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  previous_stock integer not null check(previous_stock >= 0),
  new_stock integer not null check(new_stock >= 0),
  reason text not null check(length(trim(reason)) between 3 and 500),
  adjusted_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists inventory_adjustments_variant_created_idx on public.inventory_adjustments(variant_id, created_at desc);
alter table public.inventory_adjustments enable row level security;

create or replace function public.adjust_store_inventory(
  p_variant_id uuid,
  p_new_stock integer,
  p_reason text,
  p_adjusted_by text
) returns table(previous_stock integer,new_stock integer)
language plpgsql security definer set search_path='' as $$
declare v_previous integer;
begin
 if p_new_stock < 0 then raise exception 'Stock cannot be negative'; end if;
 if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Adjustment reason is required'; end if;
 select stock into v_previous from public.product_variants where id=p_variant_id for update;
 if not found then raise exception 'Variant not found'; end if;
 update public.product_variants set stock=p_new_stock where id=p_variant_id;
 insert into public.inventory_adjustments(variant_id,previous_stock,new_stock,reason,adjusted_by)
 values(p_variant_id,v_previous,p_new_stock,left(trim(p_reason),500),left(coalesce(p_adjusted_by,''),254));
 return query select v_previous,p_new_stock;
end;
$$;
revoke all on function public.adjust_store_inventory(uuid,integer,text,text) from public;
grant execute on function public.adjust_store_inventory(uuid,integer,text,text) to service_role;



-- =====================================================================
-- SOURCE: supabase/migrations/20261101_pincode_shipping_enforcement.sql
-- =====================================================================

-- Make the database enforce the same PIN-code shipping rules shown at checkout.
-- Apply after 20261101_real_store_operations.sql.
create or replace function public.create_store_order(
 p_customer_name text,p_email text,p_phone text,p_shipping_address jsonb,p_payment_method text,p_items jsonb
) returns table(order_id uuid,order_number text,subtotal_inr integer,shipping_inr integer,total_inr integer)
language plpgsql security definer set search_path='' as $$
declare
 v_order_id uuid:=gen_random_uuid();
 v_order_number text:='DMW-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 v_subtotal integer:=0; v_shipping integer:=0; v_item jsonb;
 v_variant public.product_variants%rowtype; v_product public.products%rowtype;
 v_qty integer; v_line integer; v_lines jsonb:='[]'::jsonb;
 v_delivery public.delivery_pincodes%rowtype;
begin
 if length(trim(coalesce(p_customer_name,''))) not between 2 and 100 then raise exception 'Invalid customer name'; end if;
 if length(trim(coalesce(p_email,'')))>254 or position('@' in coalesce(p_email,''))<2 then raise exception 'Invalid email'; end if;
 if length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) not between 10 and 15 then raise exception 'Invalid phone number'; end if;
 if p_payment_method is null or p_payment_method not in ('online','cod') then raise exception 'Unsupported payment method'; end if;
 if coalesce(jsonb_typeof(p_shipping_address),'')<>'object' or coalesce(jsonb_typeof(p_items),'')<>'array' or coalesce(jsonb_array_length(p_items),0) not between 1 and 20 then raise exception 'Invalid address or cart'; end if;
 if coalesce(p_shipping_address->>'pincode','') !~ '^[1-9][0-9]{5}$' then raise exception 'Enter a valid delivery PIN code'; end if;
 select * into v_delivery from public.delivery_pincodes where pincode=p_shipping_address->>'pincode' for share;
 if not found or not v_delivery.is_serviceable then raise exception 'Delivery is not available for this PIN code'; end if;
 v_shipping:=v_delivery.shipping_inr;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_qty:=(v_item->>'quantity')::integer;
  if v_qty not between 1 and 10 then raise exception 'Invalid item quantity'; end if;
  select * into v_variant from public.product_variants where id=(v_item->>'variant_id')::uuid and is_active=true for update;
  if not found then raise exception 'A selected size is unavailable'; end if;
  if v_variant.stock<v_qty then raise exception 'Insufficient stock for SKU %',v_variant.sku; end if;
  select * into v_product from public.products where id=v_variant.product_id and is_active=true;
  if not found then raise exception 'A selected product is unavailable'; end if;
  -- Reserve immediately while holding the row lock. This also handles repeated cart lines
  -- for the same variant without allowing the same stock to be sold twice.
  update public.product_variants set stock=stock-v_qty where id=v_variant.id;
  v_line:=v_product.price_inr*v_qty; v_subtotal:=v_subtotal+v_line;
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object('product_id',v_product.id,'variant_id',v_variant.id,'product_name',v_product.name,'sku',v_variant.sku,'size',v_variant.size,'colour',v_variant.colour,'unit_price_inr',v_product.price_inr,'quantity',v_qty,'line_total_inr',v_line));
 end loop;
 insert into public.orders(id,order_number,customer_name,email,phone,shipping_address,payment_method,payment_status,subtotal_inr,shipping_inr,total_inr)
 values(v_order_id,v_order_number,trim(p_customer_name),lower(trim(p_email)),trim(p_phone),p_shipping_address,p_payment_method,
 case when p_payment_method='cod' then 'cod_due' else 'pending' end,v_subtotal,v_shipping,v_subtotal+v_shipping);
 insert into public.order_items(order_id,product_id,variant_id,product_name,sku,size,colour,unit_price_inr,quantity,line_total_inr)
 select v_order_id,(item->>'product_id')::uuid,(item->>'variant_id')::uuid,item->>'product_name',item->>'sku',item->>'size',item->>'colour',(item->>'unit_price_inr')::integer,(item->>'quantity')::integer,(item->>'line_total_inr')::integer
 from jsonb_array_elements(v_lines) as line(item);
 return query select v_order_id,v_order_number,v_subtotal,v_shipping,v_subtotal+v_shipping;
end; $$;
revoke all on function public.create_store_order(text,text,text,jsonb,text,jsonb) from public;
grant execute on function public.create_store_order(text,text,text,jsonb,text,jsonb) to service_role;



-- =====================================================================
-- SOURCE: supabase/migrations/20261102_product_media_and_returns.sql
-- =====================================================================

-- Product media uploads and secure customer return/exchange operations.
-- Apply after 20261101_real_store_operations.sql and 20261031_secure_order_tracking.sql.

-- Public read access is limited to product photos. Uploads are performed by the
-- server after owner authentication; the service-role key is never sent to browsers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view Durgamma product images" on storage.objects;
create policy "Public can view Durgamma product images"
on storage.objects for select to public
using (bucket_id = 'product-images');

alter table public.return_requests
  add column if not exists request_type text not null default 'return',
  add column if not exists customer_note text not null default '',
  add column if not exists admin_note text not null default '',
  add column if not exists processed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'return_requests_request_type_check'
      and conrelid = 'public.return_requests'::regclass
  ) then
    alter table public.return_requests
      add constraint return_requests_request_type_check
      check (request_type in ('return','exchange'));
  end if;
end $$;

create index if not exists return_requests_created_idx
  on public.return_requests(created_at desc);

create unique index if not exists one_active_return_request_per_order
  on public.return_requests(order_id)
  where status in ('requested','approved','received');

create or replace function public.create_store_return_request(
  p_tracking_token_hash text,
  p_request_type text,
  p_reason text,
  p_customer_note text default ''
) returns table(request_id uuid, request_status text)
language plpgsql security definer set search_path='' as $$
declare
  v_order public.orders%rowtype;
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

  insert into public.return_requests(
    id, order_id, reason, request_type, customer_note, status
  ) values (
    v_request_id, v_order.id, trim(p_reason), p_request_type,
    left(trim(coalesce(p_customer_note,'')),500), 'requested'
  );

  return query select v_request_id, 'requested'::text;
exception
  when unique_violation then
    raise exception 'A return or exchange request is already active for this order';
end;
$$;

revoke all on function public.create_store_return_request(text,text,text,text) from public;
grant execute on function public.create_store_return_request(text,text,text,text) to service_role;

create or replace function public.set_store_return_status(
  p_return_id uuid,
  p_status text,
  p_admin_note text default ''
) returns table(request_id uuid, request_status text)
language plpgsql security definer set search_path='' as $$
declare
  v_request public.return_requests%rowtype;
  v_allowed boolean := false;
begin
  if p_status not in ('approved','rejected','received','refunded','exchanged') then
    raise exception 'Unsupported return status';
  end if;

  select * into v_request
  from public.return_requests
  where id=p_return_id
  for update;

  if not found then raise exception 'Return request not found'; end if;

  v_allowed := case
    when v_request.status='requested' then p_status in ('approved','rejected')
    when v_request.status='approved' then p_status in ('received','refunded','exchanged')
    when v_request.status='received' then p_status in ('refunded','exchanged')
    else false
  end;

  if not v_allowed then raise exception 'This return request cannot move to the selected status'; end if;

  update public.return_requests
  set status=p_status,
      admin_note=left(trim(coalesce(p_admin_note,'')),500),
      processed_at=case when p_status in ('rejected','refunded','exchanged') then now() else processed_at end,
      updated_at=now()
  where id=p_return_id;

  return query select p_return_id,p_status;
end;
$$;

revoke all on function public.set_store_return_status(uuid,text,text) from public;
grant execute on function public.set_store_return_status(uuid,text,text) to service_role;



-- =====================================================================
-- SOURCE: supabase/migrations/20261102_store_workflow_hardening.sql
-- =====================================================================

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


-- Final verification: these counts should return zero for a newly initialized store.
select
  (select count(*) from public.products) as products,
  (select count(*) from public.product_variants) as variants,
  (select count(*) from public.orders) as orders,
  (select count(*) from public.order_items) as order_items,
  (select count(*) from public.delivery_pincodes) as configured_delivery_pincodes,
  (select count(*) from public.return_requests) as return_requests;
