import { audit, requireStaff } from "@/lib/server/auth";
import { assertInOutlet, bookingPatch, setClause, uuid } from "@/lib/server/admin";
import { db } from "@/lib/server/db";
import { json, readJson, route } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

// Change a booking's status, table or notes.
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const staff = await requireStaff(req, "host");
  const id = uuid.parse((await ctx.params).id);
  const patch = await readJson(req, bookingPatch);
  await assertInOutlet("bookings", id, staff.outletId);
  if (patch.table_id) await assertInOutlet("tables", patch.table_id, staff.outletId);

  const { sql, values } = setClause(patch, 3);
  await db().query(`update bookings set ${sql} where id = $1 and outlet_id = $2`, [id, staff.outletId, ...values]);
  await audit(staff, "update", "booking", id, patch);
  return json({ ok: true });
});
