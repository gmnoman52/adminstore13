alter table public.store_settings add column email text not null default '' check (email = '' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
