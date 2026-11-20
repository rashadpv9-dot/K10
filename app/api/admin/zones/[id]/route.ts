import { audit, requireStaff } from "@/lib/server/auth";
import { assertInOutlet, uuid } from "@/lib/server/admin";
import { db } from "@/lib/server/db";
import { json, route } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

// Remove an area. Tables in it keep working, with no area.
export const DELETE = route(async (req: Request, ctx: Ctx) => {
  const staff = await requireStaff(req, "manager");
  const id = uuid.parse((await ctx.params).id);
  await assertInOutlet("zones", id, staff.outletId);
  await db().query("delete from zones where id = $1 and outlet_id = $2", [id, staff.outletId]);
  await audit(staff, "delete", "zone", id);
  return json({ ok: true });
});
