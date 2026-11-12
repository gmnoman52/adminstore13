drop function public.place_order(uuid,text,text,text,text,jsonb);
drop function private.place_order(uuid,text,text,text,text,jsonb);
create function private.place_order(p_request_id uuid, p_fulfilment text, p_name text, p_phone text, p_address text, p_items jsonb, p_expected_total_paisa bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); cfg public.store_settings; product public.products; item jsonb;
  qty integer; subtotal bigint := 0; fee integer; snapshots jsonb := '[]'::jsonb; result uuid;
begin
  if uid is null then raise exception 'Please sign in to place an order'; end if;
  if p_request_id is null then raise exception 'Missing order request ID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || p_request_id::text, 0));
  select id into result from public.orders where user_id = uid and request_id = p_request_id;
  if result is not null then return result; end if;
  if not exists(select 1 from auth.users where id = uid and email_confirmed_at is not null) then raise exception 'Please verify your email before ordering'; end if;
  select * into cfg from public.store_settings where id = 1 for share;
  if cfg.ordering_enabled is not true then raise exception 'The store is not accepting orders yet'; end if;
  if p_fulfilment is null or p_fulfilment not in ('delivery','pickup') then raise exception 'Choose delivery or pickup'; end if;
  if (p_fulfilment = 'delivery' and not cfg.delivery_enabled) or (p_fulfilment = 'pickup' and not cfg.pickup_enabled) then raise exception 'This fulfilment option is currently unavailable'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 160 or length(trim(coalesce(p_phone,''))) not between 7 and 30 then raise exception 'Enter a valid name and phone number'; end if;
  if length(coalesce(p_address,'')) > 1000 or (p_fulfilment = 'delivery' and length(trim(coalesce(p_address,''))) < 8) then raise exception 'Enter a complete delivery address'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Your cart is invalid'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Your cart must contain 1 to 100 products'; end if;
  if (select count(distinct v->>'id') from jsonb_array_elements(p_items) v) <> jsonb_array_length(p_items) then raise exception 'Duplicate or missing products in cart'; end if;
  fee := case when p_fulfilment = 'delivery' then cfg.delivery_fee_paisa else 0 end;
  if fee is null or cfg.minimum_order_paisa is null then raise exception 'The store needs to configure its fees and minimum order'; end if;
  for item in select v from jsonb_array_elements(p_items) v order by v->>'id' loop
    if coalesce(item->>'quantity','') !~ '^[1-9][0-9]{0,4}$' then raise exception 'Invalid product quantity'; end if;
    qty := (item->>'quantity')::integer;
    select * into product from public.products where id = (item->>'id')::uuid for update;
    if not found or not product.is_active then raise exception 'A product is no longer available. Refresh your cart'; end if;
    if coalesce(item->>'price_paisa','') !~ '^[0-9]+$' or (item->>'price_paisa')::numeric <> product.price_paisa then raise exception 'Price changed for %. Refresh your cart before ordering', product.name; end if;
    if product.stock < qty then raise exception 'Not enough stock for %', product.name; end if;
    subtotal := subtotal + product.price_paisa::bigint * qty;
    snapshots := snapshots || jsonb_build_array(jsonb_build_object('id',product.id,'name',product.name,'unit',product.unit,'price_paisa',product.price_paisa,'quantity',qty));
    update public.products set stock = stock - qty where id = product.id;
  end loop;
  if subtotal < cfg.minimum_order_paisa then raise exception 'Your cart is below the store minimum order'; end if;
  if p_expected_total_paisa is null or p_expected_total_paisa <> subtotal + fee then raise exception 'Order total changed. Refresh checkout before ordering'; end if;
  insert into public.orders(user_id,request_id,fulfilment,customer_name,phone,address,items,subtotal_paisa,delivery_fee_paisa,total_paisa)
  values(uid,p_request_id,p_fulfilment,trim(p_name),trim(p_phone),case when p_fulfilment = 'delivery' then trim(p_address) else '' end,snapshots,subtotal,fee,subtotal + fee)
  returning id into result;
  return result;
end;
$$;

revoke all on function private.place_order(uuid,text,text,text,text,jsonb,bigint) from public,anon;
grant execute on function private.place_order(uuid,text,text,text,text,jsonb,bigint) to authenticated;
create function public.place_order(p_request_id uuid,p_fulfilment text,p_name text,p_phone text,p_address text,p_items jsonb,p_expected_total_paisa bigint) returns uuid language sql security invoker set search_path='' as $$ select private.place_order(p_request_id,p_fulfilment,p_name,p_phone,p_address,p_items,p_expected_total_paisa); $$;
revoke all on function public.place_order(uuid,text,text,text,text,jsonb,bigint) from public,anon;
grant execute on function public.place_order(uuid,text,text,text,text,jsonb,bigint) to authenticated;
