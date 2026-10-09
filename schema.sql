-- =====================================================================
-- Cuadre · esquema de base de datos para Supabase (PostgreSQL)
--
-- Cómo usarlo: Supabase > SQL Editor > New query > pega TODO este archivo > Run.
-- Es seguro ejecutarlo más de una vez (no borra datos).
--
-- Reglas del diseño:
--  * Todo el dinero se guarda como ENTEROS en centavos (bigint). Nunca decimales.
--  * La tasa se guarda como entero x 10.000 (873,8670 Bs/$ -> 8738670).
--  * Cada fila pertenece a un usuario (user_id) y la seguridad por filas (RLS)
--    garantiza que cada persona solo ve y modifica lo suyo.
-- =====================================================================

-- ---------- Cuentas ----------
create table if not exists public.accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 30),
  currency      text not null check (currency in ('VES', 'USD')),
  opening_minor bigint not null default 0,
  created_at    timestamptz not null default now(),
  unique (user_id, name, currency),
  unique (user_id, id)          -- permite referencias que obligan a que todo sea del mismo usuario
);

-- ---------- Categorías ----------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 24),
  icon       text not null default '🏷️' check (char_length(icon) between 1 and 16),
  kind       text not null check (kind in ('expense', 'income')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, kind, name),
  unique (user_id, id)
);

-- ---------- Movimientos (gastos e ingresos) ----------
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type         text not null check (type in ('expense', 'income')),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 10000000000000),
  currency     text not null check (currency in ('VES', 'USD')),
  rate_e4      bigint not null check (rate_e4 > 0),   -- Bs por 1 USD vigente al registrar, x 10.000
  category_id  uuid not null,
  account_id   uuid not null,
  note         text not null default '' check (char_length(note) <= 120),
  date         date not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- No se puede borrar una cuenta o categoría que tenga movimientos
  foreign key (user_id, category_id) references public.categories (user_id, id) on delete restrict,
  foreign key (user_id, account_id)  references public.accounts (user_id, id)  on delete restrict
);

create index if not exists transactions_user_date_idx     on public.transactions (user_id, date desc, created_at desc);
create index if not exists transactions_user_category_idx on public.transactions (user_id, category_id);
create index if not exists transactions_user_account_idx  on public.transactions (user_id, account_id);

-- La moneda del movimiento debe ser la de su cuenta.
create or replace function public.check_transaction_currency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  account_currency text;
begin
  select currency into account_currency
  from public.accounts
  where id = new.account_id and user_id = new.user_id;

  if account_currency is distinct from new.currency then
    raise exception 'La moneda del movimiento (%) no coincide con la de la cuenta (%)', new.currency, account_currency
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_check_currency on public.transactions;
create trigger transactions_check_currency
  before insert or update on public.transactions
  for each row execute function public.check_transaction_currency();

-- ---------- Ajustes (una fila por usuario): tasa del dólar ----------
create table if not exists public.settings (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  rate_e4         bigint not null default 0 check (rate_e4 >= 0),   -- 0 = todavía sin definir
  rate_updated_at timestamptz,
  rate_source     text not null default 'none' check (rate_source in ('none', 'bcv', 'manual')),
  updated_at      timestamptz not null default now()
);

-- ---------- v0.2: logo opcional de cada cuenta ----------
-- Imagen pequeña (96x96) guardada como texto. Seguro de ejecutar más de una vez.
alter table public.accounts
  add column if not exists logo text check (logo is null or (char_length(logo) <= 60000 and logo like 'data:image/%'));

-- ---------- v0.2: perfil (usuario y foto) ----------
create table if not exists public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  username   text check (username is null or username ~ '^[a-z0-9_.]{3,20}$'),
  avatar     text check (avatar is null or (char_length(avatar) <= 120000 and avatar like 'data:image/%')),
  updated_at timestamptz not null default now()
);
-- Dos personas no pueden tener el mismo usuario.
create unique index if not exists profiles_username_uidx on public.profiles (username) where username is not null;

-- ---------- Seguridad por filas (RLS) ----------
alter table public.profiles     enable row level security;
alter table public.accounts     enable row level security;
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;
alter table public.settings     enable row level security;

drop policy if exists "accounts: solo el dueño" on public.accounts;
create policy "accounts: solo el dueño" on public.accounts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "categories: solo el dueño" on public.categories;
create policy "categories: solo el dueño" on public.categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "transactions: solo el dueño" on public.transactions;
create policy "transactions: solo el dueño" on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "settings: solo el dueño" on public.settings;
create policy "settings: solo el dueño" on public.settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "profiles: solo el dueño" on public.profiles;
create policy "profiles: solo el dueño" on public.profiles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Permisos: solo usuarios con sesión iniciada. Quien no inició sesión no puede nada.
revoke all on public.accounts, public.categories, public.transactions, public.settings, public.profiles from anon;
grant select, insert, update, delete on public.accounts, public.categories, public.transactions, public.settings, public.profiles to authenticated;

-- ---------- Datos iniciales para un usuario nuevo ----------
-- La app la llama sola la primera vez que alguien inicia sesión. Es idempotente:
-- si ya hay cuentas o categorías, no vuelve a crearlas.
create or replace function public.seed_defaults()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Debes iniciar sesión' using errcode = '28000';
  end if;

  insert into public.settings (user_id) values (uid) on conflict (user_id) do nothing;

  if not exists (select 1 from public.accounts where user_id = uid) then
    insert into public.accounts (user_id, name, currency) values
      (uid, 'Efectivo Bs', 'VES'),
      (uid, 'Efectivo $',  'USD'),
      (uid, 'Banco 1',     'VES'),
      (uid, 'Banco 2',     'VES'),
      (uid, 'Binance',     'USD');
  end if;

  if not exists (select 1 from public.categories where user_id = uid) then
    insert into public.categories (user_id, name, icon, kind, sort_order) values
      (uid, 'Alimentación',    '🍽️', 'expense', 0),
      (uid, 'Transporte',      '🚌', 'expense', 1),
      (uid, 'Vivienda',        '🏠', 'expense', 2),
      (uid, 'Servicios',       '💡', 'expense', 3),
      (uid, 'Entretenimiento', '🎬', 'expense', 4),
      (uid, 'Compras',         '🛍️', 'expense', 5),
      (uid, 'Salud',           '💊', 'expense', 6),
      (uid, 'Educación',       '📚', 'expense', 7),
      (uid, 'Suscripciones',   '🔁', 'expense', 8),
      (uid, 'Otros',           '🧩', 'expense', 9),
      (uid, 'Sueldo',          '💼', 'income',  0),
      (uid, 'Freelance',       '🎨', 'income',  1),
      (uid, 'Otros ingresos',  '➕', 'income',  2);
  end if;
end;
$$;

revoke execute on function public.seed_defaults() from public, anon;
grant  execute on function public.seed_defaults() to authenticated;

-- ---------- v0.3: eliminar una cuenta junto con sus movimientos (todo o nada) ----------
create or replace function public.delete_account(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '28000';
  end if;
  delete from public.transactions where account_id = p_id and user_id = auth.uid();
  delete from public.accounts     where id = p_id         and user_id = auth.uid();
end;
$$;
revoke execute on function public.delete_account(uuid) from public, anon;
grant  execute on function public.delete_account(uuid) to authenticated;
