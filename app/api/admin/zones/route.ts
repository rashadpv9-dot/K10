import { z } from "zod";
import { audit, requireStaff } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { json, readJson, route } from "@/lib/server/http";

const input = z.object({ name: z.string().trim().min(1).max(40) });

// Add an area (Indoor, Terrace, Bar...).
export const POST = route(async (req) => {
  const staff = await requireStaff(req, "manager");
  const { name } = await readJson(req, input);
  const res = await db().query<{ id: string }>(
    `insert into zones (outlet_id, name, sort)
     values ($1, $2, coalesce((select max(sort) + 1 from zones where outlet_id = $1), 1)) returning id, name, sort`,
    [staff.outletId, name]
  );
  await audit(staff, "create", "zone", res.rows[0].id, { name });
  return json({ zone: res.rows[0] }, 201);
});
