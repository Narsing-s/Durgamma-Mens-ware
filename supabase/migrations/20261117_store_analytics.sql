-- Owner-only aggregate sales analytics. No customer PII is returned.
create or replace function public.get_store_analytics(p_days integer default 30)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with bounds as (
    select greatest(7, least(coalesce(p_days, 30), 90))::integer as days
  ),
  period_orders as (
    select o.id, o.total_inr, o.order_status, o.created_at
    from public.orders o, bounds b
    where o.created_at >= now() - make_interval(days => b.days)
      and o.order_status <> 'cancelled'
  ),
  summary as (
    select
      count(*)::integer as orders,
      coalesce(sum(total_inr) filter (where order_status = 'delivered'), 0)::bigint as realized_sales_inr,
      count(*) filter (where order_status = 'delivered')::integer as delivered_orders,
      count(*) filter (where order_status in ('pending','confirmed','packed','shipped'))::integer as active_orders,
      coalesce(sum(total_inr) filter (where order_status in ('pending','confirmed','packed','shipped')), 0)::bigint as pipeline_value_inr,
      coalesce(round(avg(total_inr)), 0)::bigint as average_order_value_inr
    from period_orders
  ),
  daily as (
    select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
           count(*)::integer as orders,
           coalesce(sum(total_inr) filter (where order_status = 'delivered'), 0)::bigint as sales_inr
    from period_orders
    group by date_trunc('day', created_at)
    order by date_trunc('day', created_at)
  ),
  bestsellers as (
    select i.product_name as name, coalesce(sum(i.quantity),0)::integer as units,
           coalesce(sum(i.line_total_inr),0)::bigint as ordered_value_inr
    from public.order_items i
    join period_orders o on o.id = i.order_id
    group by i.product_name
    order by sum(i.quantity) desc, sum(i.line_total_inr) desc
    limit 5
  )
  select jsonb_build_object(
    'periodDays', (select days from bounds),
    'summary', (select to_jsonb(summary) from summary),
    'dailySales', coalesce((select jsonb_agg(to_jsonb(daily) order by day) from daily), '[]'::jsonb),
    'topProducts', coalesce((select jsonb_agg(to_jsonb(bestsellers)) from bestsellers), '[]'::jsonb)
  );
$$;

revoke all on function public.get_store_analytics(integer) from public, anon, authenticated;
grant execute on function public.get_store_analytics(integer) to service_role;
