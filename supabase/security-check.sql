begin;
set local plpgsql.check_asserts=on;
create temporary table validation_ids (name text primary key, id uuid not null default gen_random_uuid());
insert into validation_ids(name) values ('owner'),('customer'),('other'),('product'),('request');
alter table validation_ids add column session_id uuid not null default gen_random_uuid();
grant select on validation_ids to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select id, id::text || '@example.invalid', now(), '{}'::jsonb, '{"role":"admin"}'::jsonb from validation_ids where name in ('owner','customer','other');
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select session_id,id,now(),now(),'aal1' from validation_ids where name in ('owner','customer','other');
insert into private.admin_users(user_id) select id from validation_ids where name = 'owner';
insert into public.products(id,name,unit,price_paisa,stock,is_active)
select id,'Transaction-only validation fixture','unit',25000,10,true from validation_ids where name = 'product';
update public.store_settings set ordering_enabled=true, delivery_enabled=true, pickup_enabled=true, address='Transaction-only validation address',phone='03000000000',delivery_fee_paisa=15000,minimum_order_paisa=0 where id=1;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from validation_ids where name='customer'),'session_id',(select session_id from validation_ids where name='customer'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare oid uuid; changed integer; denied boolean := false;
begin
  assert not public.is_admin(), 'User metadata must not grant admin access';
  update public.products set price_paisa=1 where id=(select id from validation_ids where name='product');
  get diagnostics changed = row_count;
  assert changed=0, 'Customer changed a product';
  begin insert into public.categories(name) values ('Must never persist'); exception when insufficient_privilege then denied:=true; end;
  assert denied, 'Customer created a category';
  denied:=false;
  begin insert into private.admin_users(user_id) values(auth.uid()); exception when insufficient_privilege then denied:=true; end;
  assert denied, 'Customer assigned their own admin role';
  oid:=public.place_order((select id from validation_ids where name='request'),'delivery','Validation customer','03000000000','Transaction-only delivery address',jsonb_build_array(jsonb_build_object('id',(select id from validation_ids where name='product'),'quantity',2,'price_paisa',25000)),65000);
  perform set_config('validation.order_id',oid::text,true);
  assert (select total_paisa from public.orders where id=oid)=65000, 'Server total is wrong';
  assert (select stock from public.products where id=(select id from validation_ids where name='product'))=8, 'Stock was not reserved';
  assert public.place_order((select id from validation_ids where name='request'),'delivery','Validation customer','03000000000','Transaction-only delivery address',jsonb_build_array(jsonb_build_object('id',(select id from validation_ids where name='product'),'quantity',2,'price_paisa',25000)),65000)=oid, 'Retry created another order';
  assert (select stock from public.products where id=(select id from validation_ids where name='product'))=8, 'Retry reserved stock twice';
  denied:=false;
  begin perform public.set_order_status(oid,'accepted'); exception when raise_exception then denied:=true; end;
  assert denied, 'Customer changed order status';
  denied:=false;
  begin perform public.place_order(gen_random_uuid(),'pickup','Validation customer','03000000000','',jsonb_build_array(jsonb_build_object('id',(select id from validation_ids where name='product'),'quantity',999,'price_paisa',25000)),24975000); exception when raise_exception then denied:=true; end;
  assert denied, 'Overselling was permitted';
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from validation_ids where name='other'),'session_id',(select session_id from validation_ids where name='other'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin assert not exists(select 1 from public.orders where id=current_setting('validation.order_id')::uuid), 'Another customer can read the order'; end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from validation_ids where name='owner'),'session_id',(select session_id from validation_ids where name='owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare denied boolean:=false; version timestamptz; changed integer; completed_id uuid;
begin
  assert public.is_admin(), 'Owner role is missing';
  assert exists(select 1 from public.orders where id=current_setting('validation.order_id')::uuid), 'Owner cannot read the order';
  begin perform public.set_order_status(current_setting('validation.order_id')::uuid,'completed'); exception when raise_exception then denied:=true; end;
  assert denied, 'Invalid status transition was allowed';
  perform public.set_order_status(current_setting('validation.order_id')::uuid,'cancelled');
  perform public.set_order_status(current_setting('validation.order_id')::uuid,'cancelled');
  assert (select stock from public.products where id=(select id from validation_ids where name='product'))=10, 'Cancellation must restore stock exactly once';
  select updated_at into version from public.products where id=(select id from validation_ids where name='product');
  update public.products set stock=stock where id=(select id from validation_ids where name='product') and updated_at=version;
  update public.products set stock=1 where id=(select id from validation_ids where name='product') and updated_at=version;
  get diagnostics changed = row_count;
  assert changed=0, 'A stale stock edit overwrote newer inventory';
  denied:=false;
  begin update public.store_settings set minimum_order_paisa=null where id=1; exception when check_violation then denied:=true; end;
  assert denied, 'Ordering was enabled without required settings';
  denied:=false;
  begin perform public.place_order(gen_random_uuid(),'pickup','Validation owner','03000000000','',jsonb_build_array(jsonb_build_object('id',(select id from validation_ids where name='product'),'quantity',1,'price_paisa',1)),1); exception when raise_exception then denied:=true; end;
  assert denied, 'A changed or tampered price was accepted';
  completed_id:=public.place_order(gen_random_uuid(),'pickup','Validation owner','03000000000','',jsonb_build_array(jsonb_build_object('id',(select id from validation_ids where name='product'),'quantity',1,'price_paisa',25000)),25000);
  perform public.set_order_status(completed_id,'accepted');
  perform public.set_order_status(completed_id,'preparing');
  perform public.set_order_status(completed_id,'ready');
  perform public.set_order_status(completed_id,'completed');
  assert (select status from public.orders where id=completed_id)='completed', 'Order lifecycle did not complete';
  denied:=false;
  begin perform public.set_order_status(completed_id,'cancelled'); exception when raise_exception then denied:=true; end;
  assert denied, 'Completed order was cancelled';
  assert (select stock from public.products where id=(select id from validation_ids where name='product'))=9, 'Completed order inventory is wrong';
end $$;
reset role;

-- Security regressions run in this same rolled-back transaction.
update public.store_settings set email='security-check@example.invalid' where id=1;
insert into private.write_quotas(user_id,window_started,requests)
select id,now(),120 from validation_ids where name='customer'
on conflict(user_id) do update set requests=120,window_started=now();
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from validation_ids where name='customer'),'session_id',(select session_id from validation_ids where name='customer'),'role','authenticated')::text,true);
select set_config('request.headers','{"origin":"http://localhost:8081"}',true);
select set_config('request.method','POST',true);
set local role authenticated;
do $$ declare denied boolean:=false; begin
  begin perform private.check_request(); exception when sqlstate 'PGRST' then denied:=true; end;
  assert denied, 'Write quota was not enforced';
  perform set_config('request.method','GET',true);
  perform private.check_request();
  perform set_config('request.headers','{"origin":"https://untrusted.example"}',true);
  denied:=false;
  begin perform private.check_request(); exception when sqlstate 'PT403' then denied:=true; end;
  assert denied, 'Unapproved browser origin was accepted';
  perform set_config('request.headers','{}',true);
  perform private.check_request();
end $$;
reset role;
delete from auth.sessions where id=(select session_id from validation_ids where name='customer');
set local role authenticated;
do $$ declare denied boolean:=false; begin
  assert not private.has_valid_session(), 'Revoked session stayed valid';
  assert not exists(select 1 from public.orders), 'Revoked session read orders';
  begin perform public.place_order(gen_random_uuid(),'pickup','Security check','03000000000','',jsonb_build_array(jsonb_build_object('id',(select id from validation_ids where name='product'),'quantity',1,'price_paisa',25000)),25000); exception when sqlstate 'PT401' then denied:=true; end;
  assert denied, 'Revoked session placed an order';
end $$;
reset role;
insert into auth.sessions(id,user_id,created_at,updated_at,aal) select session_id,id,now(),now(),'aal1' from validation_ids where name='customer';
insert into public.orders(user_id,request_id,fulfilment,customer_name,phone,items,subtotal_paisa,delivery_fee_paisa,total_paisa,status)
select id,gen_random_uuid(),'pickup','Rate-limit fixture','03000000000','[]'::jsonb,0,0,0,'cancelled' from validation_ids cross join generate_series(1,4) where name='customer';
set local role authenticated;
do $$ declare denied boolean:=false; begin
  begin perform public.place_order(gen_random_uuid(),'pickup','Security check','03000000000','',jsonb_build_array(jsonb_build_object('id',(select id from validation_ids where name='product'),'quantity',1,'price_paisa',25000)),25000); exception when sqlstate 'PGRST' then denied:=true; end;
  assert denied, 'Order burst limit was bypassed';
  assert public.place_order((select id from validation_ids where name='request'),'delivery','Validation customer','03000000000','Transaction-only delivery address',jsonb_build_array(jsonb_build_object('id',(select id from validation_ids where name='product'),'quantity',2,'price_paisa',25000)),65000)=current_setting('validation.order_id')::uuid, 'Rate limit broke idempotent retries';
end $$;
reset role;
update auth.sessions set created_at=now()-interval '9 hours' where id=(select session_id from validation_ids where name='owner');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from validation_ids where name='owner'),'session_id',(select session_id from validation_ids where name='owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin assert not public.is_admin(), 'Owner session maximum age was bypassed'; end $$;
reset role;

rollback;
select 'Passed: RLS, metadata spoofing, server totals, stock reservations, idempotency, order isolation, admin access, status transitions, cancellation, rollback' as result;
