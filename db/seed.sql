-- Dummy data for Kingston 10 (Adliya). Safe to run once on a fresh database.
-- Everything here is demo content: the tables are a placeholder layout, and all guests and
-- bookings are marked is_sample so they can be cleared in one go before going live.
-- Staff logins are not created here; use scripts/create-staff.mjs so no password is stored in git.

insert into outlets (id, slug, name, utc_offset_minutes, currency)
values ('00000000-0000-4000-8000-000000000010', 'adliya', 'Kingston 10 — Adliya', 180, 'BHD');

insert into booking_rules (outlet_id, allow_table_choice) values ('00000000-0000-4000-8000-000000000010', true);

insert into opening_hours (outlet_id, weekday, opens, closes)
select '00000000-0000-4000-8000-000000000010', d, '12:00', '02:00' from generate_series(0, 6) as d;

insert into zones (id, outlet_id, name, sort) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000010', 'Indoor', 1),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000010', 'Terrace', 2);

insert into floor_plans (id, outlet_id, name, is_active)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000010', 'Main floor (placeholder)', true);

insert into tables (outlet_id, floor_plan_id, zone_id, label, seats_min, seats_max, shape, x, y, w, h) values
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'T1', 1, 2, 'round', 15, 20, 7, 7),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'T2', 1, 2, 'round', 30, 20, 7, 7),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'T3', 2, 4, 'square', 45, 20, 7, 7),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'T4', 2, 4, 'square', 60, 20, 7, 7),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'T5', 4, 6, 'rect', 25, 50, 13, 11),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'T6', 6, 10, 'rect', 55, 50, 13, 11),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a2', 'P1', 2, 4, 'round', 20, 82, 7, 7),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a2', 'P2', 2, 4, 'round', 45, 82, 7, 7),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a2', 'P3', 4, 8, 'rect', 72, 82, 13, 11);

-- Dummy guests (made-up names; numbers in an unused range)
insert into customers (outlet_id, name, phone, email, is_sample)
select '00000000-0000-4000-8000-000000000010', n, p, e, true
from (values
  ('Amina Yusuf',     '+973 3000 0101', 'amina@example.com'),
  ('David Clarke',    '+973 3000 0102', null),
  ('Fatima Al Sayed', '+973 3000 0103', 'fatima@example.com'),
  ('Marcus Brown',    '+973 3000 0104', null),
  ('Priya Nair',      '+973 3000 0105', 'priya@example.com'),
  ('Omar Haddad',     '+973 3000 0106', null),
  ('Grace Mwangi',    '+973 3000 0107', 'grace@example.com'),
  ('Khalid Rashed',   '+973 3000 0108', null),
  ('Sophie Laurent',  '+973 3000 0109', 'sophie@example.com'),
  ('Tariq Mansoor',   '+973 3000 0110', null)
) as v(n, p, e);

-- Dummy bookings, placed relative to today in Bahrain so the demo always looks current
with today as (select ((now() at time zone 'UTC') + interval '3 hours')::date as d),
rows(day_offset, label, t_from, t_to, party, status, source, phone, notes) as (values
  (-1, 'T2', '20:00', '22:00', 2, 'no_show',          'online',  '+973 3000 0102', null),
  (-1, 'T4', '19:00', '21:00', 4, 'completed',        'phone',   '+973 3000 0104', null),
  ( 0, 'T1', '13:00', '15:00', 2, 'completed',        'online',  '+973 3000 0101', null),
  ( 0, 'T3', '13:30', '15:30', 4, 'completed',        'walk_in', '+973 3000 0106', null),
  ( 0, 'P2', '18:00', '20:00', 2, 'cancelled',        'online',  '+973 3000 0109', 'Guest cancelled by phone'),
  ( 0, 'T2', '19:00', '21:00', 2, 'confirmed',        'online',  '+973 3000 0103', 'Anniversary'),
  ( 0, 'T3', '19:30', '21:30', 3, 'confirmed',        'online',  '+973 3000 0105', null),
  ( 0, 'T4', '20:00', '22:00', 4, 'confirmed',        'phone',   '+973 3000 0107', 'High chair needed'),
  ( 0, 'T5', '20:00', '22:30', 6, 'pending_approval', 'online',  '+973 3000 0108', 'Birthday, bringing a cake'),
  ( 0, 'P1', '21:00', '23:00', 2, 'confirmed',        'online',  '+973 3000 0110', null),
  ( 0, 'T6', '21:00', '23:30', 8, 'confirmed',        'phone',   '+973 3000 0104', 'Team dinner'),
  ( 1, 'T1', '14:00', '16:00', 2, 'confirmed',        'online',  '+973 3000 0101', null),
  ( 1, 'T5', '19:00', '21:30', 5, 'pending_approval', 'online',  '+973 3000 0102', null),
  ( 1, 'P3', '20:00', '22:30', 7, 'confirmed',        'phone',   '+973 3000 0106', 'Terrace if weather allows'),
  ( 1, 'T4', '20:30', '22:30', 4, 'confirmed',        'online',  '+973 3000 0109', null),
  ( 2, 'T3', '19:00', '21:00', 3, 'confirmed',        'online',  '+973 3000 0105', null),
  ( 2, 'T6', '20:00', '22:30', 9, 'pending_approval', 'online',  '+973 3000 0107', 'Reggae Brunch after-party')
)
insert into bookings (outlet_id, customer_id, table_id, zone_id, party_size, starts_at, ends_at, status, source, notes, is_sample)
select t.outlet_id, c.id, t.id, t.zone_id, r.party,
       (((today.d + r.day_offset) + r.t_from::time) - interval '3 hours') at time zone 'UTC',
       (((today.d + r.day_offset) + r.t_to::time) - interval '3 hours') at time zone 'UTC',
       r.status::booking_status, r.source::booking_source, r.notes, true
from rows r
cross join today
join tables t on t.label = r.label
join customers c on c.phone = r.phone;
