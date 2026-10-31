-- Secure customer order tracking without exposing customer PII.
-- Apply this migration in the Supabase SQL editor before deploying the tracking feature.
alter table public.orders
  add column if not exists tracking_token_hash text;

create unique index if not exists orders_tracking_token_hash_uidx
  on public.orders(tracking_token_hash)
  where tracking_token_hash is not null;

comment on column public.orders.tracking_token_hash is
  'SHA-256 hash of a one-time high-entropy customer tracking token. Raw token is returned once at checkout and never stored.';
