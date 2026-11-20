-- Kingston 10 booking system — Neon (Postgres) schema.
--
-- The website and admin panel never connect to the database from the browser. All access
-- goes through the site's server routes, which check who is signed in and what their role
-- allows. The database still enforces the rules that must never break: no double bookings,
-- valid values, and one row per payment.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type staff_role as enum ('owner', 'manager', 'host');
create type table_shape as enum ('round', 'square', 'rect', 'booth', 'bar');
create type booking_source as enum ('online', 'phone', 'walk_in');
create type booking_status as enum (
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
create type deposit_mode as enum ('none', 'groups', 'all');
create type payment_status as enum ('initiated', 'captured', 'failed', 'refunded', 'partially_refunded');

-- ---------------------------------------------------------------------------
-- Outlets, staff accounts and sign-in sessions
-- ---------------------------------------------------------------------------
create table outlets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  -- Minutes ahead of UTC. Bahrain is +180 all year (no daylight saving).
  utc_offset_minutes integer not null default 180,
  currency text not null default 'BHD',
  created_at timestamptz not null default now()
);

create table staff_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) between 3 and 254),
  name text not null check (char_length(name) between 1 and 120),
  password_hash text not null,          -- bcrypt; the password itself is never stored
  is_disabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table staff (
  user_id uuid not null references staff_users (id) on delete cascade,
  outlet_id uuid not null references outlets (id) on delete cascade,
  role staff_role not null default 'host',
  created_at timestamptz not null default now(),
  primary key (user_id, outlet_id)
);
create index staff_outlet_idx on staff (outlet_id);

-- Only a hash of each session token is stored, so a copy of this table cannot be used to sign in.
create table sessions (
  token_hash text primary key,
  user_id uuid not null references staff_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expiry_idx on sessions (expires_at);

-- Used to slow down password guessing.
create table login_attempts (
  id bigint generated always as identity primary key,
  email text not null,
  succeeded boolean not null,
  at timestamptz not null default now()
);
create index login_attempts_email_at_idx on login_attempts (email, at desc);

-- ---------------------------------------------------------------------------
-- Floor plan
-- ---------------------------------------------------------------------------
create table floor_plans (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets (id) on delete cascade,
  name text not null,
  image_url text,                        -- uploaded layout image in Vercel Blob
  image_width integer,
  image_height integer,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
-- At most one active plan per outlet.
create unique index floor_plans_one_active_idx on floor_plans (outlet_id) where is_active;

create table zones (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  sort integer not null default 0,
  unique (outlet_id, name)
);

create table tables (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets (id) on delete cascade,
  floor_plan_id uuid not null references floor_plans (id) on delete cascade,
  zone_id uuid references zones (id) on delete set null,
  label text not null check (char_length(label) between 1 and 12),
  seats_min integer not null default 1 check (seats_min >= 1),
  seats_max integer not null check (seats_max >= seats_min and seats_max <= 100),
  shape table_shape not null default 'round',
  -- Position and size as percentages of the floor plan, so they survive resizing.
  x numeric(6, 3) not null default 50 check (x between 0 and 100),
  y numeric(6, 3) not null default 50 check (y between 0 and 100),
  w numeric(6, 3) not null default 6 check (w > 0 and w <= 100),
  h numeric(6, 3) not null default 6 check (h > 0 and h <= 100),
  rotation numeric(6, 2) not null default 0,
  is_active boolean not null default true,
  unique (floor_plan_id, label)
);
create index tables_outlet_idx on tables (outlet_id);

-- ---------------------------------------------------------------------------
-- Rules the client can change
-- ---------------------------------------------------------------------------
create table booking_rules (
  outlet_id uuid primary key references outlets (id) on delete cascade,
  slot_minutes integer not null default 30 check (slot_minutes in (15, 30, 60)),
  turn_minutes_small integer not null default 120 check (turn_minutes_small between 30 and 480),
  turn_minutes_large integer not null default 150 check (turn_minutes_large between 30 and 480),
  large_party_from integer not null default 5 check (large_party_from >= 2),
  max_party_online integer not null default 12 check (max_party_online between 1 and 100),
  max_covers_per_slot integer check (max_covers_per_slot is null or max_covers_per_slot >= 1),
  min_lead_minutes integer not null default 60 check (min_lead_minutes between 0 and 10080),
  max_days_ahead integer not null default 30 check (max_days_ahead between 1 and 365),
  -- Parties up to this size confirm instantly; larger ones wait for staff.
  auto_confirm_max_party integer not null default 4 check (auto_confirm_max_party between 0 and 100),
  allow_table_choice boolean not null default false,
  deposit_mode deposit_mode not null default 'groups',
  -- Money is stored in fils (1 BHD = 1000 fils) to avoid rounding errors.
  deposit_per_guest_fils integer not null default 0 check (deposit_per_guest_fils between 0 and 500000),
  hold_minutes integer not null default 10 check (hold_minutes between 1 and 60),
  updated_at timestamptz not null default now()
);

create table opening_hours (
  outlet_id uuid not null references outlets (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),   -- 0 = Sunday
  opens time not null default '12:00',
  closes time not null default '02:00',                         -- earlier than opens = next day
  is_closed boolean not null default false,
  primary key (outlet_id, weekday)
);

create table closures (
  outlet_id uuid not null references outlets (id) on delete cascade,
  day date not null,
  reason text,
  primary key (outlet_id, day)
);

-- ---------------------------------------------------------------------------
-- Customers and bookings
-- ---------------------------------------------------------------------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  phone text not null check (char_length(phone) between 5 and 24),
  email text check (email is null or char_length(email) <= 254),
  notes text,
  marketing_consent boolean not null default false,
  is_sample boolean not null default false,   -- dummy data, can be cleared in one go
  created_at timestamptz not null default now(),
  unique (outlet_id, phone)
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  outlet_id uuid not null references outlets (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete restrict,
  table_id uuid references tables (id) on delete set null,
  zone_id uuid references zones (id) on delete set null,
  party_size integer not null check (party_size between 1 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  during tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status booking_status not null,
  source booking_source not null default 'online',
  notes text check (notes is null or char_length(notes) <= 1000),
  deposit_fils integer not null default 0 check (deposit_fils >= 0),
  hold_expires_at timestamptz,
  created_by uuid references staff_users (id) on delete set null,
  is_sample boolean not null default false,   -- dummy data, can be cleared in one go
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
create index bookings_outlet_start_idx on bookings (outlet_id, starts_at);
create index bookings_customer_idx on bookings (customer_id);
create index bookings_hold_idx on bookings (hold_expires_at) where status = 'pending_payment';

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete restrict,
  provider text not null default 'tap',
  provider_charge_id text not null,
  amount_fils integer not null check (amount_fils > 0),
  currency text not null default 'BHD',
  status payment_status not null default 'initiated',
  raw jsonb,                              -- provider response, never card details
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per provider charge: a repeated webhook updates it instead of adding another.
  unique (provider, provider_charge_id)
);
create index payments_booking_idx on payments (booking_id);

create table audit_log (
  id bigint generated always as identity primary key,
  outlet_id uuid references outlets (id) on delete cascade,
  actor uuid references staff_users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb,
  at timestamptz not null default now()
);
create index audit_log_outlet_at_idx on audit_log (outlet_id, at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create function touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger bookings_touch before update on bookings for each row execute function touch_updated_at();
create trigger payments_touch before update on payments for each row execute function touch_updated_at();
create trigger booking_rules_touch before update on booking_rules for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- What the public booking form needs for one date: table sizes and positions and busy
-- time ranges. Never names, phones or notes.
-- ---------------------------------------------------------------------------
create function booking_context(p_slug text, p_date date) returns jsonb
language plpgsql
stable
as $$
declare
  o outlets;
  r booking_rules;
  h opening_hours;
  f floor_plans;
  v_hours jsonb;
  v_day_start timestamptz;
begin
  select * into o from outlets where slug = p_slug;
  if not found then
    raise exception using errcode = 'P0001', message = 'unknown_outlet';
  end if;
  select * into r from booking_rules where outlet_id = o.id;
  select * into f from floor_plans where outlet_id = o.id and is_active;

  select * into h from opening_hours where outlet_id = o.id and weekday = extract(dow from p_date)::int;
  if found then
    v_hours := jsonb_build_object('opens', h.opens, 'closes', h.closes, 'is_closed', h.is_closed);
  end if;

  -- Local midnight of p_date, as an instant.
  v_day_start := (p_date::timestamp - make_interval(mins => o.utc_offset_minutes)) at time zone 'UTC';

  return jsonb_build_object(
    'outlet', jsonb_build_object('name', o.name, 'utc_offset_minutes', o.utc_offset_minutes),
    'rules', jsonb_build_object(
      'slot_minutes', r.slot_minutes,
      'turn_minutes_small', r.turn_minutes_small,
      'turn_minutes_large', r.turn_minutes_large,
      'large_party_from', r.large_party_from,
      'max_party_online', r.max_party_online,
      'max_covers_per_slot', r.max_covers_per_slot,
      'min_lead_minutes', r.min_lead_minutes,
      'max_days_ahead', r.max_days_ahead,
      'auto_confirm_max_party', r.auto_confirm_max_party,
      'allow_table_choice', r.allow_table_choice
    ),
    'hours', v_hours,
    'closed', exists (select 1 from closures c where c.outlet_id = o.id and c.day = p_date),
    'plan', jsonb_build_object('width', f.image_width, 'height', f.image_height),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name) order by z.sort, z.name)
      from zones z
      where z.outlet_id = o.id
        and exists (select 1 from tables t where t.zone_id = z.id and t.is_active and t.floor_plan_id = f.id)
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'label', t.label, 'zone_id', t.zone_id, 'seats_min', t.seats_min, 'seats_max', t.seats_max,
        'shape', t.shape, 'x', t.x::float8, 'y', t.y::float8, 'w', t.w::float8, 'h', t.h::float8, 'rotation', t.rotation::float8
      ) order by t.label)
      from tables t
      where t.outlet_id = o.id and t.is_active and t.floor_plan_id = f.id
    ), '[]'::jsonb),
    'busy', coalesce((
      select jsonb_agg(jsonb_build_object('table_id', b.table_id, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'party_size', b.party_size))
      from bookings b
      where b.outlet_id = o.id
        and b.table_id is not null
        and b.status in ('pending_payment', 'pending_approval', 'confirmed', 'seated')
        and not (b.status = 'pending_payment' and b.hold_expires_at is not null and b.hold_expires_at <= now())
        and b.starts_at < v_day_start + interval '48 hours'
        and b.ends_at > v_day_start
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Creates a booking from the website. Every rule is checked again here: the time must be a
-- real slot inside opening hours, within the notice period and booking window, and a
-- suitable table must be free. A chosen table is used only if the outlet allows it and it
-- is free; otherwise the smallest suitable free table is assigned. Errors are short codes
-- that the website turns into plain sentences.
-- ---------------------------------------------------------------------------
create function create_booking(
  p_slug text,
  p_name text,
  p_phone text,
  p_email text,
  p_party integer,
  p_starts_at timestamptz,
  p_zone uuid default null,
  p_notes text default null,
  p_marketing boolean default false,
  p_table uuid default null
) returns jsonb
language plpgsql
volatile
as $$
declare
  o outlets;
  r booking_rules;
  h opening_hours;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := regexp_replace(btrim(coalesce(p_phone, '')), '\s+', ' ', 'g');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_notes text := nullif(left(btrim(coalesce(p_notes, '')), 1000), '');
  v_turn interval;
  v_end timestamptz;
  v_local timestamp;      -- start time on the outlet's clock
  v_today date;           -- today on the outlet's clock
  v_open timestamp;
  v_close timestamp;
  v_in_hours boolean := false;
  v_status booking_status;
  v_customer uuid;
  v_booking bookings;
  v_picked tables;
  d date;
  t record;
begin
  select * into o from outlets where slug = p_slug;
  if not found then
    raise exception using errcode = 'P0001', message = 'unknown_outlet';
  end if;
  select * into r from booking_rules where outlet_id = o.id;

  -- Who is booking
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception using errcode = 'P0001', message = 'invalid_name';
  end if;
  if v_phone !~ '^\+?[0-9][0-9 ()-]{5,22}$' then
    raise exception using errcode = 'P0001', message = 'invalid_phone';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception using errcode = 'P0001', message = 'invalid_email';
  end if;

  -- How many
  if p_party is null or p_party < 1 then
    raise exception using errcode = 'P0001', message = 'invalid_party';
  end if;
  if p_party > r.max_party_online then
    raise exception using errcode = 'P0001', message = 'party_too_large';
  end if;

  -- When
  if p_starts_at is null then
    raise exception using errcode = 'P0001', message = 'outside_hours';
  end if;
  if p_starts_at < now() + make_interval(mins => r.min_lead_minutes) then
    raise exception using errcode = 'P0001', message = 'too_soon';
  end if;
  v_local := (p_starts_at at time zone 'UTC') + make_interval(mins => o.utc_offset_minutes);
  v_today := ((now() at time zone 'UTC') + make_interval(mins => o.utc_offset_minutes))::date;
  if v_local::date > v_today + r.max_days_ahead then
    raise exception using errcode = 'P0001', message = 'too_far';
  end if;

  v_turn := make_interval(mins => case when p_party >= r.large_party_from then r.turn_minutes_large else r.turn_minutes_small end);
  v_end := p_starts_at + v_turn;

  -- The start must be a slot of that day's service, or of the previous day's if it runs past midnight.
  foreach d in array array[v_local::date, v_local::date - 1] loop
    select * into h from opening_hours where outlet_id = o.id and weekday = extract(dow from d)::int;
    continue when not found or h.is_closed;
    continue when exists (select 1 from closures c where c.outlet_id = o.id and c.day = d);
    v_open := d + h.opens;
    v_close := d + h.closes;
    if h.closes <= h.opens then
      v_close := v_close + interval '1 day';
    end if;
    if v_local >= v_open
       and v_local + v_turn <= v_close
       and mod(extract(epoch from (v_local - v_open))::bigint, r.slot_minutes * 60) = 0 then
      v_in_hours := true;
      exit;
    end if;
  end loop;
  if not v_in_hours then
    raise exception using errcode = 'P0001', message = 'outside_hours';
  end if;

  -- Limits that stop one person, or a script, from flooding the book
  if (
    select count(*) from bookings b join customers c on c.id = b.customer_id
    where b.outlet_id = o.id and c.phone = v_phone and b.starts_at > now()
      and b.status in ('pending_payment', 'pending_approval', 'confirmed')
  ) >= 3 then
    raise exception using errcode = 'P0001', message = 'too_many_bookings';
  end if;
  if (
    select count(*) from bookings b
    where b.outlet_id = o.id and b.source = 'online' and b.created_at > now() - interval '10 minutes'
  ) >= 40 then
    raise exception using errcode = 'P0001', message = 'busy';
  end if;
  if r.max_covers_per_slot is not null and (
    select coalesce(sum(b.party_size), 0) from bookings b
    where b.outlet_id = o.id and b.starts_at = p_starts_at
      and b.status in ('pending_payment', 'pending_approval', 'confirmed', 'seated')
  ) + p_party > r.max_covers_per_slot then
    raise exception using errcode = 'P0001', message = 'slot_full';
  end if;

  -- A chosen table must be allowed by the outlet, real, in use and the right size.
  if p_table is not null then
    if not r.allow_table_choice then
      raise exception using errcode = 'P0001', message = 'table_choice_off';
    end if;
    select tb.* into v_picked
    from tables tb join floor_plans f on f.id = tb.floor_plan_id and f.is_active
    where tb.id = p_table and tb.outlet_id = o.id and tb.is_active
      and tb.seats_min <= p_party and p_party <= tb.seats_max;
    if not found then
      raise exception using errcode = 'P0001', message = 'table_unsuitable';
    end if;
  end if;

  -- Up to the instant-confirm limit is confirmed straight away; larger parties wait for staff.
  -- Deposits are not collected yet, so they do not affect the status here.
  v_status := case when p_party > r.auto_confirm_max_party then 'pending_approval' else 'confirmed' end;

  insert into customers (outlet_id, name, phone, email, marketing_consent)
  values (o.id, v_name, v_phone, v_email, coalesce(p_marketing, false))
  on conflict (outlet_id, phone) do update
    set name = excluded.name,
        email = coalesce(excluded.email, customers.email),
        marketing_consent = customers.marketing_consent or excluded.marketing_consent
  returning id into v_customer;

  if p_table is not null then
    -- The customer's own choice: that table or nothing. The exclusion constraint decides.
    begin
      insert into bookings (outlet_id, customer_id, table_id, zone_id, party_size, starts_at, ends_at, status, source, notes)
      values (o.id, v_customer, v_picked.id, v_picked.zone_id, p_party, p_starts_at, v_end, v_status, 'online', v_notes)
      returning * into v_booking;
    exception when exclusion_violation then
      raise exception using errcode = 'P0001', message = 'table_taken';
    end;
    return jsonb_build_object(
      'reference', v_booking.reference,
      'status', v_booking.status,
      'starts_at', v_booking.starts_at,
      'ends_at', v_booking.ends_at,
      'party_size', v_booking.party_size,
      'table', v_picked.label
    );
  end if;

  -- No table chosen: smallest suitable free table first. If another request takes it in the
  -- same instant, the exclusion constraint rejects this insert and the next table is tried.
  for t in
    select tb.id
    from tables tb join floor_plans f on f.id = tb.floor_plan_id and f.is_active
    where tb.outlet_id = o.id
      and tb.is_active
      and tb.seats_min <= p_party and p_party <= tb.seats_max
      and (p_zone is null or tb.zone_id = p_zone)
      and not exists (
        select 1 from bookings b
        where b.table_id = tb.id
          and b.status in ('pending_payment', 'pending_approval', 'confirmed', 'seated')
          and b.during && tstzrange(p_starts_at, v_end, '[)')
      )
    order by tb.seats_max, tb.seats_min, tb.label
  loop
    begin
      insert into bookings (outlet_id, customer_id, table_id, zone_id, party_size, starts_at, ends_at, status, source, notes)
      values (o.id, v_customer, t.id, p_zone, p_party, p_starts_at, v_end, v_status, 'online', v_notes)
      returning * into v_booking;

      return jsonb_build_object(
        'reference', v_booking.reference,
        'status', v_booking.status,
        'starts_at', v_booking.starts_at,
        'ends_at', v_booking.ends_at,
        'party_size', v_booking.party_size
      );
    exception when exclusion_violation then
      null;
    end;
  end loop;

  raise exception using errcode = 'P0001', message = 'no_table';
end;
$$;
