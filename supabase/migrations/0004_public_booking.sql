-- Public booking: the two functions the website is allowed to call.
--
-- The public still has no access to any table. These functions run with the owner's rights
-- (SECURITY DEFINER), expose only what the booking form needs, and re-check every rule
-- server-side, so nothing sent by a browser is trusted.

-- ---------------------------------------------------------------------------
-- What the booking form needs to show free times for one date.
-- Contains table sizes and busy time ranges, never names, phones or notes.
-- ---------------------------------------------------------------------------
create function public.booking_context(p_slug text, p_date date) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.outlets;
  r public.booking_rules;
  h public.opening_hours;
  v_hours jsonb;
  v_day_start timestamptz;
begin
  select * into o from public.outlets where slug = p_slug;
  if not found then
    raise exception using errcode = 'P0001', message = 'unknown_outlet';
  end if;
  select * into r from public.booking_rules where outlet_id = o.id;

  select * into h from public.opening_hours where outlet_id = o.id and weekday = extract(dow from p_date)::int;
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
      'auto_confirm_max_party', r.auto_confirm_max_party
    ),
    'hours', v_hours,
    'closed', exists (select 1 from public.closures c where c.outlet_id = o.id and c.day = p_date),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name) order by z.sort, z.name)
      from public.zones z
      where z.outlet_id = o.id
        and exists (
          select 1 from public.tables t join public.floor_plans f on f.id = t.floor_plan_id and f.is_active
          where t.zone_id = z.id and t.is_active
        )
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'zone_id', t.zone_id, 'seats_min', t.seats_min, 'seats_max', t.seats_max) order by t.label)
      from public.tables t join public.floor_plans f on f.id = t.floor_plan_id and f.is_active
      where t.outlet_id = o.id and t.is_active
    ), '[]'::jsonb),
    'busy', coalesce((
      select jsonb_agg(jsonb_build_object('table_id', b.table_id, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'party_size', b.party_size))
      from public.bookings b
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
-- Creates a booking from the website. Every rule is checked here again:
-- the time must be a real slot inside opening hours, within the notice period and
-- booking window, and a suitable table must be free. The table is chosen here, not
-- by the caller. Errors are short codes the website turns into plain sentences.
-- ---------------------------------------------------------------------------
create function public.create_booking(
  p_slug text,
  p_name text,
  p_phone text,
  p_email text,
  p_party integer,
  p_starts_at timestamptz,
  p_zone uuid default null,
  p_notes text default null,
  p_marketing boolean default false
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o public.outlets;
  r public.booking_rules;
  h public.opening_hours;
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
  v_status public.booking_status;
  v_customer uuid;
  v_booking public.bookings;
  d date;
  t record;
begin
  select * into o from public.outlets where slug = p_slug;
  if not found then
    raise exception using errcode = 'P0001', message = 'unknown_outlet';
  end if;
  select * into r from public.booking_rules where outlet_id = o.id;

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
    select * into h from public.opening_hours where outlet_id = o.id and weekday = extract(dow from d)::int;
    continue when not found or h.is_closed;
    continue when exists (select 1 from public.closures c where c.outlet_id = o.id and c.day = d);
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
    select count(*) from public.bookings b join public.customers c on c.id = b.customer_id
    where b.outlet_id = o.id and c.phone = v_phone and b.starts_at > now()
      and b.status in ('pending_payment', 'pending_approval', 'confirmed')
  ) >= 3 then
    raise exception using errcode = 'P0001', message = 'too_many_bookings';
  end if;
  if (
    select count(*) from public.bookings b
    where b.outlet_id = o.id and b.source = 'online' and b.created_at > now() - interval '10 minutes'
  ) >= 40 then
    raise exception using errcode = 'P0001', message = 'busy';
  end if;
  if r.max_covers_per_slot is not null and (
    select coalesce(sum(b.party_size), 0) from public.bookings b
    where b.outlet_id = o.id and b.starts_at = p_starts_at
      and b.status in ('pending_payment', 'pending_approval', 'confirmed', 'seated')
  ) + p_party > r.max_covers_per_slot then
    raise exception using errcode = 'P0001', message = 'slot_full';
  end if;

  -- Up to the instant-confirm limit is confirmed straight away; larger parties wait for staff.
  -- Deposits are not collected yet, so they do not affect the status here.
  v_status := case when p_party > r.auto_confirm_max_party then 'pending_approval' else 'confirmed' end;

  insert into public.customers (outlet_id, name, phone, email, marketing_consent)
  values (o.id, v_name, v_phone, v_email, coalesce(p_marketing, false))
  on conflict (outlet_id, phone) do update
    set name = excluded.name,
        email = coalesce(excluded.email, public.customers.email),
        marketing_consent = public.customers.marketing_consent or excluded.marketing_consent
  returning id into v_customer;

  -- Smallest suitable free table first. If another request takes it in the same instant,
  -- the exclusion constraint rejects this insert and the next table is tried.
  for t in
    select tb.id
    from public.tables tb join public.floor_plans f on f.id = tb.floor_plan_id and f.is_active
    where tb.outlet_id = o.id
      and tb.is_active
      and tb.seats_min <= p_party and p_party <= tb.seats_max
      and (p_zone is null or tb.zone_id = p_zone)
      and not exists (
        select 1 from public.bookings b
        where b.table_id = tb.id
          and b.status in ('pending_payment', 'pending_approval', 'confirmed', 'seated')
          and b.during && tstzrange(p_starts_at, v_end, '[)')
      )
    order by tb.seats_max, tb.seats_min, tb.label
  loop
    begin
      insert into public.bookings (outlet_id, customer_id, table_id, zone_id, party_size, starts_at, ends_at, status, source, notes)
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

revoke execute on function public.booking_context(text, date) from public;
revoke execute on function public.create_booking(text, text, text, text, integer, timestamptz, uuid, text, boolean) from public;
grant execute on function public.booking_context(text, date) to anon, authenticated;
grant execute on function public.create_booking(text, text, text, text, integer, timestamptz, uuid, text, boolean) to anon, authenticated;
