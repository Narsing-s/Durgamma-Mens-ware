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
