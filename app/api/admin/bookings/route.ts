import { z } from "zod";
import { audit, requireStaff } from "@/lib/server/auth";
import { BOOKING_COLUMNS, BOOKING_FROM, assertInOutlet, bookingStatus, newBookingInput } from "@/lib/server/admin";
import { db } from "@/lib/server/db";
import { HttpError, json, readJson, route } from "@/lib/server/http";

const listQuery = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }).optional(),
  status: bookingStatus.optional(),
});

// Bookings starting in [from, to), optionally one status only.
export const GET = route(async (req) => {
  const staff = await requireStaff(req, "host");
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const { from, to, status } = listQuery.parse(params);
  const where = ["b.outlet_id = $1", "b.starts_at >= $2"];
  const values: unknown[] = [staff.outletId, from];
  if (to) where.push(`b.starts_at < $${values.push(to)}`);
  if (status) where.push(`b.status = $${values.push(status)}`);
  const res = await db().query(`select ${BOOKING_COLUMNS} from ${BOOKING_FROM} where ${where.join(" and ")} order by b.starts_at limit 500`, values);
  return json({ bookings: res.rows });
});

// Phone or walk-in booking added by staff. Staff may book outside the online limits, but the
// database still refuses a table that is already taken.
export const POST = route(async (req) => {
  const staff = await requireStaff(req, "host");
  const input = await readJson(req, newBookingInput);
  const q = db();

  const rules = await q.query<{ turn_minutes_small: number; turn_minutes_large: number; large_party_from: number }>(
    "select turn_minutes_small, turn_minutes_large, large_party_from from booking_rules where outlet_id = $1",
    [staff.outletId]
  );
  const r = rules.rows[0];
  if (!r) throw new HttpError(409, "no_rules");
  const turn = input.party_size >= r.large_party_from ? r.turn_minutes_large : r.turn_minutes_small;
  const start = new Date(input.starts_at);
  const end = new Date(start.getTime() + turn * 60_000);

  if (input.zone_id) await assertInOutlet("zones", input.zone_id, staff.outletId);
  let tableId = input.table_id ?? null;
  if (tableId) {
    await assertInOutlet("tables", tableId, staff.outletId);
  } else {
    // Smallest suitable free table, as the website does.
    const free = await q.query<{ id: string }>(
      `select tb.id from tables tb join floor_plans f on f.id = tb.floor_plan_id and f.is_active
       where tb.outlet_id = $1 and tb.is_active and tb.seats_min <= $2 and $2 <= tb.seats_max
         and ($3::uuid is null or tb.zone_id = $3)
         and not exists (select 1 from bookings b where b.table_id = tb.id
           and b.status in ('pending_payment', 'pending_approval', 'confirmed', 'seated')
           and b.during && tstzrange($4, $5, '[)'))
       order by tb.seats_max, tb.seats_min, tb.label limit 1`,
      [staff.outletId, input.party_size, input.zone_id ?? null, start.toISOString(), end.toISOString()]
    );
    tableId = free.rows[0]?.id ?? null;
    if (!tableId) throw new HttpError(409, "no_table");
  }

  const customer = await q.query<{ id: string }>(
    `insert into customers (outlet_id, name, phone, email) values ($1, $2, $3, $4)
     on conflict (outlet_id, phone) do update set name = excluded.name, email = coalesce(excluded.email, customers.email)
     returning id`,
    [staff.outletId, input.name, input.phone, input.email ?? null]
  );
  const created = await q.query<{ id: string; reference: string }>(
    `insert into bookings (outlet_id, customer_id, table_id, zone_id, party_size, starts_at, ends_at, status, source, notes, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8, $9, $10) returning id, reference`,
    [staff.outletId, customer.rows[0].id, tableId, input.zone_id ?? null, input.party_size, start.toISOString(), end.toISOString(), input.source, input.notes ?? null, staff.userId]
  );
  await audit(staff, "create", "booking", created.rows[0].id, { source: input.source, party: input.party_size });
  return json({ booking: created.rows[0] }, 201);
});
