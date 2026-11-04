-- Manual courier tracking details for Durgamma Menswear.
-- Apply once in Supabase SQL Editor.
alter table public.orders
  add column if not exists shipping_provider text,
  add column if not exists tracking_number text,
  add column if not exists tracking_url text,
  add column if not exists expected_delivery_date date;

alter table public.orders
  drop constraint if exists orders_shipping_provider_length_check,
  add constraint orders_shipping_provider_length_check
    check (shipping_provider is null or length(trim(shipping_provider)) between 1 and 100),
  drop constraint if exists orders_tracking_number_length_check,
  add constraint orders_tracking_number_length_check
    check (tracking_number is null or length(trim(tracking_number)) between 1 and 120),
  drop constraint if exists orders_tracking_url_length_check,
  add constraint orders_tracking_url_length_check
    check (tracking_url is null or length(tracking_url) <= 500);
