-- Verified-purchase product feedback. Reviews are private until owner moderation.
create table if not exists public.product_reviews (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 order_item_id uuid not null references public.order_items(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete cascade,
 customer_name text not null,
 rating smallint not null check (rating between 1 and 5),
 title text not null check (char_length(title) between 3 and 100),
 body text not null check (char_length(body) between 10 and 1500),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(order_item_id)
);
create index if not exists product_reviews_public_idx on public.product_reviews(product_id,created_at desc) where status='approved';
create index if not exists product_reviews_moderation_idx on public.product_reviews(status,created_at desc);
alter table public.product_reviews enable row level security;
revoke all on public.product_reviews from public,anon,authenticated;
grant select,insert,update,delete on public.product_reviews to service_role;
