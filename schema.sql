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

-- =====================================================================
-- v0.4: pagos programados, cuotas (Cashea), deudas, presupuestos,
--       gastos divididos, tasas de referencia y días de aviso.
-- Seguro de ejecutar más de una vez. Requiere PostgreSQL 15 o superior
-- (los proyectos nuevos de Supabase ya lo tienen).
-- =====================================================================

-- Tasas de referencia (euro BCV y dólar paralelo) y días de aviso por defecto
alter table public.settings
  add column if not exists eur_rate_e4     bigint not null default 0 check (eur_rate_e4 >= 0),
  add column if not exists eur_updated_at  timestamptz,
  add column if not exists par_rate_e4     bigint not null default 0 check (par_rate_e4 >= 0),
  add column if not exists par_updated_at  timestamptz,
  add column if not exists remind_days     integer not null default 3 check (remind_days between 0 and 30);

-- Gasto dividido: lista de {name, shareMinor, settled} con lo que le toca a cada persona
alter table public.transactions
  add column if not exists split jsonb check (split is null or jsonb_typeof(split) = 'array');

-- ---------- Pagos programados (se repiten) ----------
create table if not exists public.scheduled_payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 10000000000000),
  currency     text not null check (currency in ('VES', 'USD')),
  category_id  uuid,
  account_id   uuid,
  frequency    text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'yearly')),
  next_due     date not null,
  anchor_day   integer not null default 1 check (anchor_day between 1 and 31),
  remind_days  integer check (remind_days between 0 and 30),   -- null = usar el general
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, category_id) references public.categories (user_id, id) on delete set null (category_id),
  foreign key (user_id, account_id)  references public.accounts (user_id, id)  on delete set null (account_id)
);

-- ---------- Compras en cuotas (Cashea y similares) ----------
create table if not exists public.installment_plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  total_minor  bigint not null check (total_minor > 0 and total_minor <= 10000000000000),
  currency     text not null check (currency in ('VES', 'USD')),
  installments integer not null check (installments between 1 and 60),
  paid_count   integer not null default 0 check (paid_count >= 0),
  frequency    text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'yearly')),
  first_due    date not null,
  anchor_day   integer not null default 1 check (anchor_day between 1 and 31),
  category_id  uuid,
  account_id   uuid,
  remind_days  integer check (remind_days between 0 and 30),
  created_at   timestamptz not null default now(),
  unique (user_id, id),
  check (paid_count <= installments),
  foreign key (user_id, category_id) references public.categories (user_id, id) on delete set null (category_id),
  foreign key (user_id, account_id)  references public.accounts (user_id, id)  on delete set null (account_id)
);

-- ---------- Deudas: 'owe' = yo debo, 'owed' = me deben ----------
create table if not exists public.debts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('owe', 'owed')),
  person      text not null check (char_length(btrim(person)) between 1 and 40),
  note        text not null default '' check (char_length(note) <= 120),
  total_minor bigint not null check (total_minor > 0 and total_minor <= 10000000000000),
  paid_minor  bigint not null default 0 check (paid_minor >= 0),
  currency    text not null check (currency in ('VES', 'USD')),
  due_date    date,
  remind_days integer check (remind_days between 0 and 30),
  created_at  timestamptz not null default now(),
  unique (user_id, id),
  check (paid_minor <= total_minor)
);

-- ---------- Presupuestos mensuales por categoría ----------
create table if not exists public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  limit_minor bigint not null check (limit_minor > 0 and limit_minor <= 10000000000000),
  currency    text not null check (currency in ('VES', 'USD')),
  created_at  timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, category_id),
  foreign key (user_id, category_id) references public.categories (user_id, id) on delete cascade
);

alter table public.scheduled_payments enable row level security;
alter table public.installment_plans  enable row level security;
alter table public.debts              enable row level security;
alter table public.budgets            enable row level security;

drop policy if exists "scheduled_payments: solo el dueño" on public.scheduled_payments;
create policy "scheduled_payments: solo el dueño" on public.scheduled_payments
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "installment_plans: solo el dueño" on public.installment_plans;
create policy "installment_plans: solo el dueño" on public.installment_plans
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "debts: solo el dueño" on public.debts;
create policy "debts: solo el dueño" on public.debts
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "budgets: solo el dueño" on public.budgets;
create policy "budgets: solo el dueño" on public.budgets
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.scheduled_payments, public.installment_plans, public.debts, public.budgets from anon;
grant select, insert, update, delete on public.scheduled_payments, public.installment_plans, public.debts, public.budgets to authenticated;

-- Al borrar una cuenta, también hay que soltarla de los pagos que la usaban (lo hace sola la regla "set null").

-- =====================================================================
-- v0.4.1: recibos, transferencias internas, metas, distribución y tasas históricas.
-- Migración idempotente: puede ejecutarse de nuevo sin borrar movimientos existentes.
-- =====================================================================

-- Fotos de recibos pequeñas (comprimidas por el navegador antes de guardarlas).
alter table public.transactions
  add column if not exists receipt_image text
  check (receipt_image is null or (char_length(receipt_image) <= 240000 and receipt_image like 'data:image/%'));

-- Distribución sugerida del ingreso. Debe sumar 100 %; la validación se hace en la app.
alter table public.settings
  add column if not exists alloc_invest integer not null default 10 check (alloc_invest between 0 and 100),
  add column if not exists alloc_enjoyment integer not null default 20 check (alloc_enjoyment between 0 and 100),
  add column if not exists alloc_savings integer not null default 20 check (alloc_savings between 0 and 100),
  add column if not exists alloc_emergency integer not null default 10 check (alloc_emergency between 0 and 100),
  add column if not exists alloc_needs integer not null default 40 check (alloc_needs between 0 and 100);

-- Transferencias separadas de los movimientos. No se tratan como ingresos ni gastos.
create table if not exists public.account_transfers (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_account_id    uuid not null,
  to_account_id      uuid not null,
  from_amount_minor  bigint not null check (from_amount_minor > 0 and from_amount_minor <= 10000000000000),
  to_amount_minor    bigint not null check (to_amount_minor > 0 and to_amount_minor <= 10000000000000),
  from_currency      text not null check (from_currency in ('VES', 'USD')),
  to_currency        text not null check (to_currency in ('VES', 'USD')),
  rate_e4            bigint not null default 0 check (rate_e4 >= 0),
  date               date not null default current_date,
  note               text not null default '' check (char_length(note) <= 120),
  created_at         timestamptz not null default now(),
  unique (user_id, id),
  check (from_account_id <> to_account_id),
  check (from_currency <> to_currency or from_amount_minor = to_amount_minor),
  foreign key (user_id, from_account_id) references public.accounts (user_id, id) on delete restrict,
  foreign key (user_id, to_account_id)   references public.accounts (user_id, id) on delete restrict
);
create index if not exists account_transfers_user_date_idx on public.account_transfers (user_id, date desc, created_at desc);

create or replace function public.check_transfer_accounts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  from_currency_actual text;
  to_currency_actual text;
begin
  select currency into from_currency_actual from public.accounts where id = new.from_account_id and user_id = new.user_id;
  select currency into to_currency_actual from public.accounts where id = new.to_account_id and user_id = new.user_id;
  if from_currency_actual is null or to_currency_actual is null then
    raise exception 'Las dos cuentas deben existir y pertenecer al mismo usuario' using errcode = '23503';
  end if;
  if new.from_currency is distinct from from_currency_actual or new.to_currency is distinct from to_currency_actual then
    raise exception 'La moneda de la transferencia no coincide con la moneda de las cuentas' using errcode = '23514';
  end if;
  if new.from_currency <> new.to_currency and new.rate_e4 <= 0 then
    raise exception 'Una transferencia entre monedas necesita una tasa positiva' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists account_transfers_check_accounts on public.account_transfers;
create trigger account_transfers_check_accounts before insert or update on public.account_transfers
for each row execute function public.check_transfer_accounts();

-- Metas de ahorro con progreso explícito; no mueve dinero por sí misma.
create table if not exists public.savings_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  target_minor bigint not null check (target_minor > 0 and target_minor <= 10000000000000),
  saved_minor  bigint not null default 0 check (saved_minor >= 0 and saved_minor <= 10000000000000),
  currency    text not null check (currency in ('VES', 'USD')),
  due_date    date,
  note        text not null default '' check (char_length(note) <= 120),
  created_at  timestamptz not null default now(),
  unique (user_id, id),
  check (saved_minor <= target_minor)
);

-- Historial de tasas para estimar cambios del valor referencial del saldo en bolívares.
create table if not exists public.exchange_rate_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rate_e4     bigint not null check (rate_e4 > 0),
  source      text not null default 'manual' check (source in ('manual', 'bcv', 'none')),
  recorded_at timestamptz not null default now(),
  unique (user_id, id)
);
create index if not exists exchange_rate_history_user_time_idx on public.exchange_rate_history (user_id, recorded_at desc);

alter table public.account_transfers enable row level security;
alter table public.savings_goals enable row level security;
alter table public.exchange_rate_history enable row level security;

drop policy if exists "account_transfers: solo el dueño" on public.account_transfers;
create policy "account_transfers: solo el dueño" on public.account_transfers
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "savings_goals: solo el dueño" on public.savings_goals;
create policy "savings_goals: solo el dueño" on public.savings_goals
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "exchange_rate_history: solo el dueño" on public.exchange_rate_history;
create policy "exchange_rate_history: solo el dueño" on public.exchange_rate_history
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.account_transfers, public.savings_goals, public.exchange_rate_history from anon;
grant select, insert, update, delete on public.account_transfers, public.savings_goals, public.exchange_rate_history to authenticated;

-- La eliminación de una cuenta también elimina transferencias donde participa.
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
  delete from public.account_transfers where user_id = auth.uid() and (from_account_id = p_id or to_account_id = p_id);
  delete from public.transactions where account_id = p_id and user_id = auth.uid();
  delete from public.accounts where id = p_id and user_id = auth.uid();
end;
$$;
revoke execute on function public.delete_account(uuid) from public, anon;
grant execute on function public.delete_account(uuid) to authenticated;

-- =====================================================================
-- v0.5: aportes de metas, espacios compartidos familiares y libro de hogar.
-- Migración idempotente: no elimina los datos anteriores.
-- =====================================================================

-- Historial de aportes a una meta. Un aporte es una reserva interna, no un gasto.
create table if not exists public.goal_contributions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id      uuid not null,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 10000000000000),
  currency     text not null check (currency in ('VES', 'USD')),
  date         date not null default current_date,
  note         text not null default '' check (char_length(note) <= 120),
  created_at   timestamptz not null default now(),
  foreign key (user_id, goal_id) references public.savings_goals (user_id, id) on delete cascade
);
create index if not exists goal_contributions_user_goal_idx on public.goal_contributions (user_id, goal_id, date desc);
alter table public.goal_contributions enable row level security;
drop policy if exists "goal_contributions: solo el dueño" on public.goal_contributions;
create policy "goal_contributions: solo el dueño" on public.goal_contributions
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.goal_contributions from anon;
grant select, insert, update, delete on public.goal_contributions to authenticated;

-- Aporte transaccional: guarda el registro y actualiza el progreso atómicamente.
create or replace function public.contribute_to_goal(p_goal_id uuid, p_amount_minor bigint, p_date date default current_date, p_note text default '')
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g public.savings_goals%rowtype;
  contribution_id uuid;
begin
  if uid is null then raise exception 'Debes iniciar sesión' using errcode = '28000'; end if;
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception 'El aporte debe ser mayor que cero' using errcode = '23514'; end if;
  select * into g from public.savings_goals where id = p_goal_id and user_id = uid for update;
  if not found then raise exception 'No se encontró la meta' using errcode = 'P0002'; end if;
  if g.saved_minor + p_amount_minor > g.target_minor then raise exception 'El aporte supera lo que falta para la meta' using errcode = '23514'; end if;
  insert into public.goal_contributions (user_id, goal_id, amount_minor, currency, date, note)
    values (uid, g.id, p_amount_minor, g.currency, coalesce(p_date, current_date), left(coalesce(p_note, ''), 120))
    returning id into contribution_id;
  update public.savings_goals set saved_minor = saved_minor + p_amount_minor where id = g.id and user_id = uid;
  return contribution_id;
end;
$$;
revoke execute on function public.contribute_to_goal(uuid, bigint, date, text) from public, anon;
grant execute on function public.contribute_to_goal(uuid, bigint, date, text) to authenticated;

-- Espacios compartidos. El libro familiar es independiente del libro personal:
-- compartirlo nunca concede acceso a las tablas personales del miembro.
create table if not exists public.family_spaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);
create table if not exists public.family_members (
  space_id  uuid not null references public.family_spaces (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index if not exists family_members_user_idx on public.family_members (user_id, space_id);

-- El código no se puede leer directamente desde el navegador; solo se obtiene al crear un espacio.
create table if not exists public.family_invites (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.family_spaces (id) on delete cascade,
  invite_code text not null unique,
  created_by  uuid not null references auth.users (id) on delete cascade,
  expires_at  timestamptz not null default (now() + interval '30 days'),
  max_uses    integer not null default 10 check (max_uses between 1 and 50),
  uses        integer not null default 0 check (uses >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists family_invites_code_idx on public.family_invites (invite_code) where active;

create table if not exists public.family_expenses (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.family_spaces (id) on delete cascade,
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 10000000000000),
  currency     text not null check (currency in ('VES', 'USD')),
  category     text not null default '' check (char_length(category) <= 40),
  paid_by      text not null default '' check (char_length(paid_by) <= 60),
  date         date not null default current_date,
  note         text not null default '' check (char_length(note) <= 120),
  created_at   timestamptz not null default now()
);
create index if not exists family_expenses_space_date_idx on public.family_expenses (space_id, date desc, created_at desc);

create or replace function public.is_family_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.family_members m where m.space_id = p_space_id and m.user_id = auth.uid());
$$;
create or replace function public.is_family_owner(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.family_members m where m.space_id = p_space_id and m.user_id = auth.uid() and m.role = 'owner');
$$;
revoke execute on function public.is_family_member(uuid) from public, anon;
revoke execute on function public.is_family_owner(uuid) from public, anon;
grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.is_family_owner(uuid) to authenticated;

create or replace function public.create_family_space(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  sid uuid;
  code text;
  clean_name text := btrim(coalesce(p_name, ''));
begin
  if uid is null then raise exception 'Debes iniciar sesión' using errcode = '28000'; end if;
  if char_length(clean_name) < 1 or char_length(clean_name) > 60 then raise exception 'El nombre debe tener entre 1 y 60 caracteres' using errcode = '23514'; end if;
  insert into public.family_spaces (name, owner_id) values (clean_name, uid) returning id into sid;
  insert into public.family_members (space_id, user_id, role) values (sid, uid, 'owner');
  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));
  insert into public.family_invites (space_id, invite_code, created_by) values (sid, code, uid);
  return jsonb_build_object('space_id', sid, 'invite_code', code, 'name', clean_name);
end;
$$;

create or replace function public.join_family_space(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv public.family_invites%rowtype;
begin
  if uid is null then raise exception 'Debes iniciar sesión' using errcode = '28000'; end if;
  select * into inv from public.family_invites where invite_code = upper(btrim(coalesce(p_invite_code, ''))) and active = true for update;
  if not found or inv.expires_at < now() or inv.uses >= inv.max_uses then raise exception 'El código de invitación no es válido, venció o alcanzó su límite' using errcode = '22023'; end if;
  insert into public.family_members (space_id, user_id, role) values (inv.space_id, uid, 'member') on conflict (space_id, user_id) do nothing;
  update public.family_invites set uses = uses + 1, active = (uses + 1 < max_uses) where id = inv.id;
  return inv.space_id;
end;
$$;
revoke execute on function public.create_family_space(text) from public, anon;
revoke execute on function public.join_family_space(text) from public, anon;
grant execute on function public.create_family_space(text) to authenticated;
grant execute on function public.join_family_space(text) to authenticated;

alter table public.family_spaces enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invites enable row level security;
alter table public.family_expenses enable row level security;

drop policy if exists "family_spaces: integrantes pueden ver" on public.family_spaces;
create policy "family_spaces: integrantes pueden ver" on public.family_spaces
  for select to authenticated using (public.is_family_member(id));
drop policy if exists "family_spaces: dueño administra" on public.family_spaces;
create policy "family_spaces: dueño administra" on public.family_spaces
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "family_spaces: dueño elimina" on public.family_spaces;
create policy "family_spaces: dueño elimina" on public.family_spaces
  for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "family_members: integrantes leen" on public.family_members;
create policy "family_members: integrantes leen" on public.family_members
  for select to authenticated using (user_id = (select auth.uid()) or public.is_family_member(space_id));
-- Sin políticas de escritura directa en family_members: altas solo por RPC seguro.
-- Sin política SELECT en family_invites: los códigos no se enumeran desde el cliente.

drop policy if exists "family_expenses: integrantes leen" on public.family_expenses;
create policy "family_expenses: integrantes leen" on public.family_expenses
  for select to authenticated using (public.is_family_member(space_id));
drop policy if exists "family_expenses: integrantes crean" on public.family_expenses;
create policy "family_expenses: integrantes crean" on public.family_expenses
  for insert to authenticated with check (created_by = (select auth.uid()) and public.is_family_member(space_id));
drop policy if exists "family_expenses: autor o dueño edita" on public.family_expenses;
create policy "family_expenses: autor o dueño edita" on public.family_expenses
  for update to authenticated using (created_by = (select auth.uid()) or public.is_family_owner(space_id))
  with check (created_by = (select auth.uid()) or public.is_family_owner(space_id));
drop policy if exists "family_expenses: autor o dueño elimina" on public.family_expenses;
create policy "family_expenses: autor o dueño elimina" on public.family_expenses
  for delete to authenticated using (created_by = (select auth.uid()) or public.is_family_owner(space_id));

revoke all on public.family_spaces, public.family_members, public.family_invites, public.family_expenses from anon;
grant select, update, delete on public.family_spaces to authenticated;
grant select on public.family_members to authenticated;
grant select, insert, update, delete on public.family_expenses to authenticated;


-- =====================================================================
-- v0.5.1: suscripciones Web Push y registro de envíos para evitar duplicados.
-- El navegador puede crear/borrar solo su propia suscripción. El emisor programado
-- usa la clave service_role exclusivamente en el entorno servidor.
-- =====================================================================
create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint        text not null unique check (char_length(endpoint) between 20 and 2048),
  p256dh          text not null check (char_length(p256dh) between 20 and 256),
  auth            text not null check (char_length(auth) between 10 and 128),
  expiration_time bigint,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, id)
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id, created_at desc);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions: solo el dueño" on public.push_subscriptions;
create policy "push_subscriptions: solo el dueño" on public.push_subscriptions
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Log privado del servidor (no se concede acceso al cliente). Se guarda una huella de
-- la notificación y la fecha, no el contenido financiero enviado.
create table if not exists public.push_delivery_log (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid not null references public.push_subscriptions (id) on delete cascade,
  notification_key  text not null check (char_length(notification_key) between 1 and 160),
  sent_on           date not null default current_date,
  created_at        timestamptz not null default now(),
  unique (subscription_id, notification_key, sent_on)
);
create index if not exists push_delivery_log_sent_idx on public.push_delivery_log (sent_on desc);
alter table public.push_delivery_log enable row level security;
revoke all on public.push_delivery_log from anon, authenticated;
grant select, insert, delete on public.push_subscriptions to service_role;
grant select, insert, update, delete on public.push_delivery_log to service_role;
