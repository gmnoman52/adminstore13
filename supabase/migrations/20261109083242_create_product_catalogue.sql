create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  description text not null default '',
  unit text not null check (length(trim(unit)) between 1 and 40),
  price_paisa integer not null check (price_paisa >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text check (image_url is null or image_url ~ '^https://'),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
revoke all on public.products from anon, authenticated;
grant select on public.products to anon, authenticated;
create policy "Customers can read active products" on public.products
  for select to anon, authenticated using (is_active = true);
create index products_active_name on public.products (name, id) where is_active = true;
