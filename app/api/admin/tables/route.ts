import { audit, requireStaff } from "@/lib/server/auth";
import { TABLE_COLUMNS, activePlanId, assertInOutlet, tableInput } from "@/lib/server/admin";
import { db } from "@/lib/server/db";
import { json, readJson, route } from "@/lib/server/http";

// Add a table to the active floor plan.
export const POST = route(async (req) => {
  const staff = await requireStaff(req, "manager");
  const t = await readJson(req, tableInput);
  if (t.zone_id) await assertInOutlet("zones", t.zone_id, staff.outletId);
  const planId = await activePlanId(staff.outletId);
  const res = await db().query<{ id: string }>(
    `insert into tables (outlet_id, floor_plan_id, zone_id, label, seats_min, seats_max, shape, x, y, w, h, rotation, is_active)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning ${TABLE_COLUMNS}`,
    [staff.outletId, planId, t.zone_id, t.label, t.seats_min, t.seats_max, t.shape, t.x, t.y, t.w, t.h, t.rotation, t.is_active]
  );
  await audit(staff, "create", "table", res.rows[0].id, { label: t.label });
  return json({ table: res.rows[0] }, 201);
});
