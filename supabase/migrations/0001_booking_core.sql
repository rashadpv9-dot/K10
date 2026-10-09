-- Kingston 10 booking core
-- Outlets, staff, floor plans, tables, booking rules, customers, bookings, payments, audit log.
--
-- Access model: the public website never talks to these tables directly. Public reads and
-- booking writes go through server code using the service role (which bypasses RLS).
-- Signed-in staff use the "authenticated" role and are limited by the RLS policies below.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.staff_role as enum ('owner', 'manager', 'host');
create type public.table_shape as enum ('round', 'square', 'rect', 'booth', 'bar');
create type public.booking_source as enum ('online', 'phone', 'walk_in');
create type public.booking_status as enum (
  'pending_payment',   -- table held while the customer pays; expires at hold_expires_at
  'pending_approval',  -- group booking waiting for staff
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'declined',
  'no_show',
  'expired'            -- payment hold ran out
);
create type public.deposit_mode as enum ('none', 'groups', 'all');
create type public.payment_status as enum ('initiated', 'captured', 'failed', 'refunded', 'partially_refunded');

-- ---------------------------------------------------------------------------
-- Outlets and staff
-- ---------------------------------------------------------------------------
create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  -- Minutes ahead of UTC. Bahrain is +180 all year (no daylight saving).
  utc_offset_minutes integer not null default 180,
  currency text not null default 'BHD',
  created_at timestamptz not null default now()
);

create table public.staff (
  user_id uuid not null references auth.users (id) on delete cascade,
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  role public.staff_role not null default 'host',
  display_name text,
  created_at timestamptz not null default now(),
  primary key (user_id, outlet_id)
);
create index staff_outlet_idx on public.staff (outlet_id);

-- ---------------------------------------------------------------------------
-- Floor plan
-- ---------------------------------------------------------------------------
create table public.floor_plans (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  name text not null,
  image_path text,                       -- uploaded layout image in private storage
  image_width integer,
  image_height integer,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
-- At most one active plan per outlet.
create unique index floor_plans_one_active_idx on public.floor_plans (outlet_id) where is_active;

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  name text not null,
  sort integer not null default 0,
  unique (outlet_id, name)
);

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  floor_plan_id uuid not null references public.floor_plans (id) on delete cascade,
  zone_id uuid references public.zones (id) on delete set null,
  label text not null,
  seats_min integer not null default 1 check (seats_min >= 1),
  seats_max integer not null check (seats_max >= seats_min),
  shape public.table_shape not null default 'round',
  -- Position and size as percentages of the floor plan image, so they survive resizing.
  x numeric(6, 3) not null default 50 check (x between 0 and 100),
  y numeric(6, 3) not null default 50 check (y between 0 and 100),
  w numeric(6, 3) not null default 6 check (w > 0 and w <= 100),
  h numeric(6, 3) not null default 6 check (h > 0 and h <= 100),
  rotation numeric(6, 2) not null default 0,
  is_active boolean not null default true,
  unique (floor_plan_id, label)
);
create index tables_outlet_idx on public.tables (outlet_id);

-- ---------------------------------------------------------------------------
-- Rules the client can change
-- ---------------------------------------------------------------------------
create table public.booking_rules (
  outlet_id uuid primary key references public.outlets (id) on delete cascade,
  slot_minutes integer not null default 30 check (slot_minutes in (15, 30, 60)),
  turn_minutes_small integer not null default 120 check (turn_minutes_small between 30 and 480),
  turn_minutes_large integer not null default 150 check (turn_minutes_large between 30 and 480),
  large_party_from integer not null default 5 check (large_party_from >= 2),
  max_party_online integer not null default 12 check (max_party_online >= 1),
  max_covers_per_slot integer check (max_covers_per_slot is null or max_covers_per_slot >= 1),
  min_lead_minutes integer not null default 60 check (min_lead_minutes >= 0),
  max_days_ahead integer not null default 30 check (max_days_ahead between 1 and 365),
  -- Parties up to this size confirm instantly; larger ones wait for staff.
  auto_confirm_max_party integer not null default 4 check (auto_confirm_max_party >= 0),
  allow_table_choice boolean not null default false,
  deposit_mode public.deposit_mode not null default 'groups',
  -- Money is stored in fils (1 BHD = 1000 fils) to avoid rounding errors.
  deposit_per_guest_fils integer not null default 0 check (deposit_per_guest_fils >= 0),
  hold_minutes integer not null default 10 check (hold_minutes between 1 and 60),
  updated_at timestamptz not null default now()
);

create table public.opening_hours (
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),   -- 0 = Sunday
  opens time not null default '12:00',
  closes time not null default '02:00',                         -- earlier than opens = next day
  is_closed boolean not null default false,
  primary key (outlet_id, weekday)
);

create table public.closures (
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  day date not null,
  reason text,
  primary key (outlet_id, day)
);

-- ---------------------------------------------------------------------------
-- Customers and bookings
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  phone text not null check (char_length(phone) between 5 and 24),
  email text check (email is null or char_length(email) <= 254),
  notes text,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  unique (outlet_id, phone)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete restrict,
  table_id uuid references public.tables (id) on delete set null,
  zone_id uuid references public.zones (id) on delete set null,
  party_size integer not null check (party_size between 1 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  during tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status public.booking_status not null,
  source public.booking_source not null default 'online',
  notes text check (notes is null or char_length(notes) <= 1000),
  deposit_fils integer not null default 0 check (deposit_fils >= 0),
  hold_expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),

  -- The database itself refuses two live bookings on one table at overlapping times,
  -- even if two requests arrive at the same instant.
  constraint bookings_no_double_booking exclude using gist (
    table_id with =,
    during with &&
  ) where (table_id is not null and status in ('pending_payment', 'pending_approval', 'confirmed', 'seated'))
);
create index bookings_outlet_start_idx on public.bookings (outlet_id, starts_at);
create index bookings_customer_idx on public.bookings (customer_id);
create index bookings_hold_idx on public.bookings (hold_expires_at) where status = 'pending_payment';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  provider text not null default 'tap',
  provider_charge_id text not null,
  amount_fils integer not null check (amount_fils > 0),
  currency text not null default 'BHD',
  status public.payment_status not null default 'initiated',
  raw jsonb,                              -- provider response, never card details
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per provider charge: a repeated webhook updates it instead of adding another.
  unique (provider, provider_charge_id)
);
create index payments_booking_idx on public.payments (booking_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  outlet_id uuid references public.outlets (id) on delete cascade,
  actor uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb,
  at timestamptz not null default now()
);
create index audit_log_outlet_at_idx on public.audit_log (outlet_id, at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();
create trigger booking_rules_touch before update on public.booking_rules
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Role helpers used by the policies
-- ---------------------------------------------------------------------------
create function public.current_staff_role(p_outlet uuid) returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select s.role
  from public.staff s
  where s.outlet_id = p_outlet and s.user_id = (select auth.uid())
$$;

create function public.is_staff(p_outlet uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select public.current_staff_role(p_outlet) is not null $$;

create function public.is_manager(p_outlet uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_staff_role(p_outlet) in ('owner', 'manager'), false) $$;

create function public.is_owner(p_outlet uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_staff_role(p_outlet) = 'owner', false) $$;

revoke execute on function public.current_staff_role(uuid), public.is_staff(uuid), public.is_manager(uuid), public.is_owner(uuid) from public, anon;
grant execute on function public.current_staff_role(uuid), public.is_staff(uuid), public.is_manager(uuid), public.is_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: nothing for the public role, RLS-gated access for signed-in staff
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.payments, public.audit_log from authenticated;
revoke delete on public.bookings, public.outlets from authenticated;
revoke insert on public.outlets from authenticated;

alter table public.outlets enable row level security;
alter table public.staff enable row level security;
alter table public.floor_plans enable row level security;
alter table public.zones enable row level security;
alter table public.tables enable row level security;
alter table public.booking_rules enable row level security;
alter table public.opening_hours enable row level security;
alter table public.closures enable row level security;
alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.audit_log enable row level security;

-- Outlets: staff can see their outlet, owners can edit it.
create policy outlets_staff_read on public.outlets for select to authenticated using (public.is_staff(id));
create policy outlets_owner_update on public.outlets for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));

-- Staff list: visible to the outlet's staff, managed by owners only.
create policy staff_read on public.staff for select to authenticated using (public.is_staff(outlet_id));
create policy staff_owner_insert on public.staff for insert to authenticated with check (public.is_owner(outlet_id));
create policy staff_owner_update on public.staff for update to authenticated
  using (public.is_owner(outlet_id)) with check (public.is_owner(outlet_id));
create policy staff_owner_delete on public.staff for delete to authenticated using (public.is_owner(outlet_id));

-- Layout and rules: any staff member can read, managers and owners can change.
create policy floor_plans_read on public.floor_plans for select to authenticated using (public.is_staff(outlet_id));
create policy floor_plans_manage on public.floor_plans for all to authenticated
  using (public.is_manager(outlet_id)) with check (public.is_manager(outlet_id));

create policy zones_read on public.zones for select to authenticated using (public.is_staff(outlet_id));
create policy zones_manage on public.zones for all to authenticated
  using (public.is_manager(outlet_id)) with check (public.is_manager(outlet_id));

create policy tables_read on public.tables for select to authenticated using (public.is_staff(outlet_id));
create policy tables_manage on public.tables for all to authenticated
  using (public.is_manager(outlet_id)) with check (public.is_manager(outlet_id));

create policy booking_rules_read on public.booking_rules for select to authenticated using (public.is_staff(outlet_id));
create policy booking_rules_manage on public.booking_rules for all to authenticated
  using (public.is_manager(outlet_id)) with check (public.is_manager(outlet_id));

create policy opening_hours_read on public.opening_hours for select to authenticated using (public.is_staff(outlet_id));
create policy opening_hours_manage on public.opening_hours for all to authenticated
  using (public.is_manager(outlet_id)) with check (public.is_manager(outlet_id));

create policy closures_read on public.closures for select to authenticated using (public.is_staff(outlet_id));
create policy closures_manage on public.closures for all to authenticated
  using (public.is_manager(outlet_id)) with check (public.is_manager(outlet_id));

-- Customers and bookings: all staff work with them; only managers can delete a customer.
create policy customers_read on public.customers for select to authenticated using (public.is_staff(outlet_id));
create policy customers_insert on public.customers for insert to authenticated with check (public.is_staff(outlet_id));
create policy customers_update on public.customers for update to authenticated
  using (public.is_staff(outlet_id)) with check (public.is_staff(outlet_id));
create policy customers_delete on public.customers for delete to authenticated using (public.is_manager(outlet_id));

create policy bookings_read on public.bookings for select to authenticated using (public.is_staff(outlet_id));
create policy bookings_insert on public.bookings for insert to authenticated with check (public.is_staff(outlet_id));
create policy bookings_update on public.bookings for update to authenticated
  using (public.is_staff(outlet_id)) with check (public.is_staff(outlet_id));

-- Payments and the audit log are written by server code only; managers can read them.
create policy payments_read on public.payments for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and public.is_manager(b.outlet_id)));
create policy audit_log_read on public.audit_log for select to authenticated using (public.is_manager(outlet_id));
