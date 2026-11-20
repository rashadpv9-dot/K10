import { audit, requireStaff } from "@/lib/server/auth";
import { rulesPatch, setClause } from "@/lib/server/admin";
import { db } from "@/lib/server/db";
import { HttpError, json, readJson, route } from "@/lib/server/http";

// Change booking rules (managers and owners).
export const PATCH = route(async (req) => {
  const staff = await requireStaff(req, "manager");
  const patch = await readJson(req, rulesPatch);
  if (Object.keys(patch).length === 0) throw new HttpError(400, "nothing_to_change");
  const { sql, values } = setClause(patch, 2);
  const res = await db().query(`update booking_rules set ${sql} where outlet_id = $1 returning *`, [staff.outletId, ...values]);
  await audit(staff, "update", "booking_rules", staff.outletId, patch);
  return json({ rules: res.rows[0] });
});
