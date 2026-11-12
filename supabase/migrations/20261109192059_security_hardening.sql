-- Existing grants remain explicit; new objects do not become public APIs by default.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;

create function private.has_valid_session() returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=auth.uid()
      and (s.not_after is null or s.not_after>now())
      and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and not coalesce(u.is_anonymous,false)
      and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  );
$$;
revoke all on function private.has_valid_session() from public, anon;
grant execute on function private.has_valid_session() to authenticated;

create function private.has_owner_session() returns boolean
language sql stable security definer set search_path='' as $$
  select private.has_valid_session() and exists (
    select 1 from private.admin_users a join auth.sessions s on s.user_id=a.user_id
    where a.user_id=auth.uid() and s.id=nullif(auth.jwt()->>'session_id','')::uuid
      and s.created_at>now()-interval '8 hours'
  );
$$;
revoke all on function private.has_owner_session() from public, anon;
grant execute on function private.has_owner_session() to authenticated;
create or replace function public.is_admin() returns boolean language sql stable security invoker set search_path='' as $$
  select private.has_owner_session();
$$;

alter policy "Read own orders or admin" on public.orders using (
  (select private.has_valid_session()) and (user_id=(select auth.uid()) or (select public.is_admin()))
);

create table private.allowed_web_origins (
  origin text primary key check(origin ~ '^https?://[^/[:space:]]+$' and origin not like '%*%')
);
alter table private.allowed_web_origins enable row level security;
revoke all on private.allowed_web_origins from public, anon, authenticated;
insert into private.allowed_web_origins(origin) values
  ('http://localhost:8081'),('http://127.0.0.1:8081'),
  ('http://localhost:5173'),('http://127.0.0.1:5173');

-- One quota row per account. The upsert serializes concurrent writes and stays bounded.
create table private.write_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started timestamptz not null,
  requests integer not null check(requests>0)
);
alter table private.write_quotas enable row level security;
revoke all on private.write_quotas from public, anon, authenticated;

create function private.check_request() returns void
language plpgsql security definer set search_path='' as $$
declare
  request_origin text:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'origin';
  uid uuid:=auth.uid();
  attempts integer;
begin
  -- Origin is defense in depth, never authentication. Native apps may omit it.
  if request_origin is not null and not exists(select 1 from private.allowed_web_origins o where o.origin=request_origin) then
    raise sqlstate 'PT403' using message='This website origin is not allowed';
  end if;
  if uid is null then return; end if;
  if not private.has_valid_session() then raise sqlstate 'PT401' using message='Your session ended. Please sign in again'; end if;
  -- PostgREST also runs STABLE RPCs in read-only transactions.
  if current_setting('transaction_read_only')='on' or coalesce(current_setting('request.method',true),'GET') not in ('POST','PUT','PATCH','DELETE') then return; end if;
  insert into private.write_quotas(user_id,window_started,requests) values(uid,now(),1)
  on conflict(user_id) do update set
    window_started=case when write_quotas.window_started<=now()-interval '1 minute' then now() else write_quotas.window_started end,
    requests=case when write_quotas.window_started<=now()-interval '1 minute' then 1 else write_quotas.requests+1 end
  returning requests into attempts;
  if attempts>120 then
    raise sqlstate 'PGRST' using message='{"code":"RATE_LIMITED","message":"Too many changes. Wait a minute and try again"}',
      detail='{"status":429,"headers":{"Retry-After":"60"}}';
  end if;
end;
$$;
revoke all on function private.check_request() from public;
grant usage on schema private to anon;
grant execute on function private.check_request() to anon, authenticated;
alter role authenticator set pgrst.db_pre_request='private.check_request';

alter table public.products add constraint products_description_length check(length(description)<=4000);
alter table public.products add constraint products_image_url_length check(image_url is null or length(image_url)<=2048);
alter table public.store_settings add constraint store_contact_lengths check(length(address)<=1000 and length(phone)<=30);
alter table public.store_settings drop constraint store_settings_email_check;
alter table public.store_settings add constraint store_settings_email_check
  check(email='' or (length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'));

notify pgrst, 'reload config';
notify pgrst, 'reload schema';

create or replace function private.place_order(p_request_id uuid, p_fulfilment text, p_name text, p_phone text, p_address text, p_items jsonb, p_expected_total_paisa bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); cfg public.store_settings; product public.products; item jsonb;
  qty integer; subtotal bigint := 0; fee integer; snapshots jsonb := '[]'::jsonb; result uuid;
begin
  if not private.has_valid_session() then raise sqlstate 'PT401' using message='Your session ended. Please sign in again'; end if;
  if p_request_id is null then raise exception 'Missing order request ID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('order-rate:' || uid::text, 0));
  select id into result from public.orders where user_id = uid and request_id = p_request_id;
  if result is not null then return result; end if;
  if (select count(*) from public.orders where user_id=uid and created_at>now()-interval '10 minutes')>=5
    or (select count(*) from public.orders where user_id=uid and created_at>now()-interval '1 day')>=30 then
    raise sqlstate 'PGRST' using message='{"code":"ORDER_RATE_LIMITED","message":"Order limit reached. Please wait before placing another order"}',
      detail='{"status":429,"headers":{"Retry-After":"600"}}';
  end if;
  if not exists(select 1 from auth.users where id = uid and email_confirmed_at is not null) then raise exception 'Please verify your email before ordering'; end if;
  select * into cfg from public.store_settings where id = 1 for share;
  if cfg.ordering_enabled is not true then raise exception 'The store is not accepting orders yet'; end if;
  if p_fulfilment is null or p_fulfilment not in ('delivery','pickup') then raise exception 'Choose delivery or pickup'; end if;
  if (p_fulfilment = 'delivery' and not cfg.delivery_enabled) or (p_fulfilment = 'pickup' and not cfg.pickup_enabled) then raise exception 'This fulfilment option is currently unavailable'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 160 or length(trim(coalesce(p_phone,''))) not between 7 and 30 then raise exception 'Enter a valid name and phone number'; end if;
  if length(coalesce(p_address,'')) > 1000 or (p_fulfilment = 'delivery' and length(trim(coalesce(p_address,''))) < 8) then raise exception 'Enter a complete delivery address'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Your cart is invalid'; end if;
  if octet_length(p_items::text)>32768 then raise exception 'Your cart is too large'; end if;
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
