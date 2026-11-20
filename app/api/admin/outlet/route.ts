import { requireStaff } from "@/lib/server/auth";
import { TABLE_COLUMNS } from "@/lib/server/admin";
import { db } from "@/lib/server/db";
import { HttpError, json, route } from "@/lib/server/http";

// Everything the admin panel needs to start: outlet, role, rules, hours, areas, floor plan, tables.
export const GET = route(async (req) => {
  const staff = await requireStaff(req, "host");
  const q = db();
  const id = staff.outletId;
  const [outlet, rules, hours, zones, plan] = await Promise.all([
    q.query("select id, name, slug, utc_offset_minutes, currency from outlets where id = $1", [id]),
    q.query("select * from booking_rules where outlet_id = $1", [id]),
    q.query("select outlet_id, weekday, opens::text as opens, closes::text as closes, is_closed from opening_hours where outlet_id = $1 order by weekday", [id]),
    q.query("select id, name, sort from zones where outlet_id = $1 order by sort, name", [id]),
    q.query<{ id: string }>("select id, name, image_url, image_width, image_height from floor_plans where outlet_id = $1 and is_active", [id]),
  ]);
  if (!outlet.rows[0] || !plan.rows[0]) throw new HttpError(404, "not_found");
  const tables = await q.query(`select ${TABLE_COLUMNS} from tables where floor_plan_id = $1 order by label`, [plan.rows[0].id]);
  return json({
    outlet: outlet.rows[0],
    role: staff.role,
    me: { email: staff.email, name: staff.name },
    rules: rules.rows[0],
    hours: hours.rows,
    zones: zones.rows,
    plan: plan.rows[0],
    tables: tables.rows,
  });
});
