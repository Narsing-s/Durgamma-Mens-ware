-- Customer account order history uses the verified Supabase Auth email as its
-- ownership boundary. Checkout normalizes customer emails to lowercase.
-- This composite index supports exact email-scoped lookup and newest-first ordering.
create index if not exists orders_email_created_idx
  on public.orders (email, created_at desc);
