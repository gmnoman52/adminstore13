alter table public.products add column updated_at timestamptz not null default now();
create function private.stamp_product_update() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at := clock_timestamp(); return new; end;
$$;
revoke all on function private.stamp_product_update() from public, anon, authenticated;
create trigger products_updated_at before update on public.products for each row execute function private.stamp_product_update();
