// Queries and input rules shared by the admin routes. Every query is limited to the
// signed-in staff member's outlet.
import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./http";

export const uuid = z.string().uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);

export const BOOKING_COLUMNS = `
  b.id, b.reference, b.table_id, b.zone_id, b.party_size, b.starts_at, b.ends_at, b.status, b.source, b.notes, b.is_sample,
  json_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email) as customer,
  case when t.id is null then null else json_build_object('id', t.id, 'label', t.label) end as "table"`;
export const BOOKING_FROM = `bookings b join customers c on c.id = b.customer_id left join tables t on t.id = b.table_id`;

export const TABLE_COLUMNS = `id, outlet_id, floor_plan_id, zone_id, label, seats_min, seats_max, shape,
  x::float8 as x, y::float8 as y, w::float8 as w, h::float8 as h, rotation::float8 as rotation, is_active`;

export async function activePlanId(outletId: string): Promise<string> {
  const res = await db().query<{ id: string }>("select id from floor_plans where outlet_id = $1 and is_active", [outletId]);
  if (!res.rows[0]) throw new HttpError(409, "no_floor_plan");
  return res.rows[0].id;
}

/** Throws 404 unless the row exists in this outlet. */
export async function assertInOutlet(table: "tables" | "zones" | "bookings", id: string, outletId: string) {
  const res = await db().query(`select 1 from ${table} where id = $1 and outlet_id = $2`, [id, outletId]);
  if (!res.rows[0]) throw new HttpError(404, "not_found");
}

export const bookingStatus = z.enum([
  "pending_payment",
  "pending_approval",
  "confirmed",
  "seated",
  "completed",
  "cancelled",
  "declined",
  "no_show",
  "expired",
]);

export const newBookingInput = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(24),
  email: z.string().trim().email().max(254).nullable().optional(),
  party_size: z.number().int().min(1).max(100),
  starts_at: z.string().datetime({ offset: true }),
  table_id: uuid.nullable().optional(),
  zone_id: uuid.nullable().optional(),
  source: z.enum(["phone", "walk_in", "online"]).default("phone"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const bookingPatch = z
  .object({
    status: bookingStatus.optional(),
    table_id: uuid.nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "nothing to change");

export const tableInput = z.object({
  label: z.string().trim().min(1).max(12),
  seats_min: z.number().int().min(1).max(100),
  seats_max: z.number().int().min(1).max(100),
  shape: z.enum(["round", "square", "rect", "booth", "bar"]),
  zone_id: uuid.nullable(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().gt(0).max(100),
  h: z.number().gt(0).max(100),
  rotation: z.number().min(-360).max(360),
  is_active: z.boolean(),
});

export const rulesPatch = z
  .object({
    slot_minutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    turn_minutes_small: z.number().int().min(30).max(480),
    turn_minutes_large: z.number().int().min(30).max(480),
    large_party_from: z.number().int().min(2).max(100),
    max_party_online: z.number().int().min(1).max(100),
    max_covers_per_slot: z.number().int().min(1).max(1000).nullable(),
    min_lead_minutes: z.number().int().min(0).max(10080),
    max_days_ahead: z.number().int().min(1).max(365),
    auto_confirm_max_party: z.number().int().min(0).max(100),
    allow_table_choice: z.boolean(),
    deposit_mode: z.enum(["none", "groups", "all"]),
    deposit_per_guest_fils: z.number().int().min(0).max(500000),
    hold_minutes: z.number().int().min(1).max(60),
  })
  .partial();

export const hoursInput = z
  .array(z.object({ weekday: z.number().int().min(0).max(6), opens: time, closes: time, is_closed: z.boolean() }))
  .length(7);

/** Builds "col = $n" pairs for a partial update; column names come from the schema keys only. */
export function setClause(patch: Record<string, unknown>, startAt = 1): { sql: string; values: unknown[] } {
  const keys = Object.keys(patch);
  return { sql: keys.map((k, i) => `${k} = $${startAt + i}`).join(", "), values: keys.map((k) => patch[k]) };
}
