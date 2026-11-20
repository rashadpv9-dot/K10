import { z } from "zod";
import { db } from "@/lib/server/db";
import { json, route } from "@/lib/server/http";

const query = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), outlet: z.string().max(40).default("adliya") });

// Free-time data for the public booking form: table sizes, positions and busy ranges only.
export const GET = route(async (req) => {
  const { date, outlet } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const res = await db().query<{ c: unknown }>("select booking_context($1, $2::date) as c", [outlet, date]);
  return json(res.rows[0].c);
});
