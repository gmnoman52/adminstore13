create schema if not exists private;
create table private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.admin_users enable row level security;
grant usage on schema private to authenticated;
grant select on private.admin_users to authenticated;
create policy "Read own admin membership" on private.admin_users for select to authenticated using (user_id = (select auth.uid()));
create function public.is_admin() returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from private.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check(length(trim(name)) between 1 and 80),
  is_active boolean not null default false
);
alter table public.categories enable row level security;
grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
create policy "Read active categories" on public.categories for select to anon, authenticated using (is_active);
create policy "Admins manage categories" on public.categories for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
alter table public.products add column category_id uuid references public.categories(id) on delete set null;
create index products_category_id on public.products(category_id);
grant insert, update, delete on public.products to authenticated;
create policy "Admins manage products" on public.products for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create table public.store_settings (
  id smallint primary key default 1 check(id = 1),
  name text not null default 'United Super Store' check(length(trim(name)) between 1 and 160),
  address text not null default '', phone text not null default '',
  ordering_enabled boolean not null default false,
  delivery_enabled boolean not null default false,
  pickup_enabled boolean not null default false,
  delivery_fee_paisa integer check(delivery_fee_paisa >= 0),
  minimum_order_paisa integer check(minimum_order_paisa >= 0)
);
insert into public.store_settings(id) values (1);
alter table public.store_settings enable row level security;
grant select on public.store_settings to anon, authenticated;
grant update on public.store_settings to authenticated;
create policy "Read store information" on public.store_settings for select to anon, authenticated using (true);
create policy "Admins update store settings" on public.store_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  request_id uuid not null,
  fulfilment text not null check(fulfilment in ('delivery','pickup')),
  customer_name text not null check(length(trim(customer_name)) between 1 and 160),
  phone text not null check(length(trim(phone)) between 7 and 30),
  address text not null default '',
  items jsonb not null check(jsonb_typeof(items) = 'array'),
  subtotal_paisa bigint not null check(subtotal_paisa >= 0),
  delivery_fee_paisa integer not null check(delivery_fee_paisa >= 0),
  total_paisa bigint not null check(total_paisa = subtotal_paisa + delivery_fee_paisa),
  payment_method text not null default 'cash' check(payment_method = 'cash'),
  status text not null default 'pending' check(status in ('pending','accepted','preparing','ready','out_for_delivery','completed','cancelled')),
  created_at timestamptz not null default now(),
  unique(user_id, request_id)
);
create index orders_user_created on public.orders(user_id, created_at desc);
create index orders_status_created on public.orders(status, created_at desc);
alter table public.orders enable row level security;
grant select on public.orders to authenticated;
create policy "Read own orders or admin" on public.orders for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

create function private.place_order(p_request_id uuid, p_fulfilment text, p_name text, p_phone text, p_address text, p_items jsonb)
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
    if product.stock < qty then raise exception 'Not enough stock for %', product.name; end if;
    subtotal := subtotal + product.price_paisa::bigint * qty;
    snapshots := snapshots || jsonb_build_array(jsonb_build_object('id',product.id,'name',product.name,'unit',product.unit,'price_paisa',product.price_paisa,'quantity',qty));
    update public.products set stock = stock - qty where id = product.id;
  end loop;
  if subtotal < cfg.minimum_order_paisa then raise exception 'Your cart is below the store minimum order'; end if;
  insert into public.orders(user_id,request_id,fulfilment,customer_name,phone,address,items,subtotal_paisa,delivery_fee_paisa,total_paisa)
  values(uid,p_request_id,p_fulfilment,trim(p_name),trim(p_phone),case when p_fulfilment = 'delivery' then trim(p_address) else '' end,snapshots,subtotal,fee,subtotal + fee)
  returning id into result;
  return result;
end;
$$;
revoke all on function private.place_order(uuid,text,text,text,text,jsonb) from public, anon;
grant execute on function private.place_order(uuid,text,text,text,text,jsonb) to authenticated;
create function public.place_order(p_request_id uuid, p_fulfilment text, p_name text, p_phone text, p_address text, p_items jsonb)
returns uuid language sql security invoker set search_path = '' as $$ select private.place_order(p_request_id,p_fulfilment,p_name,p_phone,p_address,p_items); $$;
revoke all on function public.place_order(uuid,text,text,text,text,jsonb) from public, anon;
grant execute on function public.place_order(uuid,text,text,text,text,jsonb) to authenticated;

create function private.set_order_status(p_order_id uuid, p_status text) returns void language plpgsql security definer set search_path = '' as $$
declare current_order public.orders; allowed text[]; item jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if current_order.status = p_status then return; end if;
  allowed := case current_order.status
    when 'pending' then array['accepted','cancelled']
    when 'accepted' then array['preparing','cancelled']
    when 'preparing' then case when current_order.fulfilment = 'pickup' then array['ready','cancelled'] else array['out_for_delivery','cancelled'] end
    when 'ready' then array['completed','cancelled']
    when 'out_for_delivery' then array['completed','cancelled'] else array[]::text[] end;
  if p_status is null or not (p_status = any(allowed)) then raise exception 'Invalid order status transition'; end if;
  if p_status = 'cancelled' then
    for item in select v from jsonb_array_elements(current_order.items) v order by v->>'id' loop
      update public.products set stock = stock + (item->>'quantity')::integer where id = (item->>'id')::uuid;
    end loop;
  end if;
  update public.orders set status = p_status where id = p_order_id;
end;
$$;
revoke all on function private.set_order_status(uuid,text) from public, anon;
grant execute on function private.set_order_status(uuid,text) to authenticated;
create function public.set_order_status(p_order_id uuid,p_status text) returns void language sql security invoker set search_path = '' as $$ select private.set_order_status(p_order_id,p_status); $$;
revoke all on function public.set_order_status(uuid,text) from public, anon;
grant execute on function public.set_order_status(uuid,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy "Admins insert product images" on storage.objects for insert to authenticated with check(bucket_id = 'product-images' and (select public.is_admin()));
create policy "Admins update product images" on storage.objects for update to authenticated using(bucket_id = 'product-images' and (select public.is_admin())) with check(bucket_id = 'product-images' and (select public.is_admin()));
create policy "Admins delete product images" on storage.objects for delete to authenticated using(bucket_id = 'product-images' and (select public.is_admin()));
create policy "Admins read stored product objects" on storage.objects for select to authenticated using(bucket_id = 'product-images' and (select public.is_admin()));
