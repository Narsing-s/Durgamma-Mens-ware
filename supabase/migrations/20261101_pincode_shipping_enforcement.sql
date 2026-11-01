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
