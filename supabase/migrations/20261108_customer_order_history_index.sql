-- Customer account order history uses the verified Supabase Auth email as its
-- ownership boundary. Existing orders already store checkout email and have
-- an email lookup index in schema.sql; no customer PII or auth tokens are copied.
-- This migration adds a normalized lookup index without changing order data.
create index if not exists orders_email_lower_created_idx
  on public.orders (lower(email), created_at desc);
