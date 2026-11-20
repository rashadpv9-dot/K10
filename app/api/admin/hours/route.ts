import { audit, requireStaff } from "@/lib/server/auth";
import { hoursInput } from "@/lib/server/admin";
import { db } from "@/lib/server/db";
import { HttpError, json, readJson, route } from "@/lib/server/http";

// Replace the weekly opening hours (managers and owners).
export const PUT = route(async (req) => {
  const staff = await requireStaff(req, "manager");
  const days = await readJson(req, hoursInput);
  if (new Set(days.map((d) => d.weekday)).size !== 7) throw new HttpError(400, "one_row_per_day");
  for (const d of days) {
    await db().query(
      `insert into opening_hours (outlet_id, weekday, opens, closes, is_closed) values ($1, $2, $3, $4, $5)
       on conflict (outlet_id, weekday) do update set opens = excluded.opens, closes = excluded.closes, is_closed = excluded.is_closed`,
      [staff.outletId, d.weekday, d.opens.slice(0, 5), d.closes.slice(0, 5), d.is_closed]
    );
  }
  await audit(staff, "update", "opening_hours", staff.outletId, days);
  return json({ ok: true });
});
