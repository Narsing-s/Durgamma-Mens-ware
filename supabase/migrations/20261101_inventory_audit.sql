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
