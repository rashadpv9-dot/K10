import { audit, requireStaff } from "@/lib/server/auth";
import { assertInOutlet, setClause, tableInput, uuid } from "@/lib/server/admin";
import { db } from "@/lib/server/db";
import { json, readJson, route } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };
const tablePatch = tableInput.partial().refine((v) => Object.keys(v).length > 0, "nothing to change");

// Move, resize or edit a table.
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const staff = await requireStaff(req, "manager");
  const id = uuid.parse((await ctx.params).id);
  const patch = await readJson(req, tablePatch);
  await assertInOutlet("tables", id, staff.outletId);
  if (patch.zone_id) await assertInOutlet("zones", patch.zone_id, staff.outletId);
  const { sql, values } = setClause(patch, 3);
  await db().query(`update tables set ${sql} where id = $1 and outlet_id = $2`, [id, staff.outletId, ...values]);
  await audit(staff, "update", "table", id, patch);
  return json({ ok: true });
});

// Remove a table. Its past bookings are kept, without a table.
export const DELETE = route(async (req: Request, ctx: Ctx) => {
  const staff = await requireStaff(req, "manager");
  const id = uuid.parse((await ctx.params).id);
  await assertInOutlet("tables", id, staff.outletId);
  await db().query("delete from tables where id = $1 and outlet_id = $2", [id, staff.outletId]);
  await audit(staff, "delete", "table", id);
  return json({ ok: true });
});
