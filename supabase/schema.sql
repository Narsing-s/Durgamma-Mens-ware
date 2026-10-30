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
 select v_order_id,(x->>'product_id')::uuid,(x->>'variant_id')::uuid,x->>'product_name',x->>'sku',x->>'size',x->>'colour',(x->>'unit_price_inr')::integer,(x->>'quantity')::integer,(x->>'line_total_inr')::integer
 from jsonb_array_elements(v_lines) as x;
 return query select v_order_id,v_order_number,v_subtotal,v_shipping,v_subtotal+v_shipping;
end; $$;
revoke all on function public.create_store_order(text,text,text,jsonb,text,jsonb) from public;
-- Grant only after a trusted, rate-limited server API is implemented and reviewed.
