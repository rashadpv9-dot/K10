import { z } from "zod";
import { db } from "@/lib/server/db";
import { json, readJson, route } from "@/lib/server/http";

// Shape checks only; every booking rule is re-checked inside the database function.
const input = z.object({
  outlet: z.string().max(40).default("adliya"),
  name: z.string().max(200),
  phone: z.string().max(40),
  email: z.string().max(254).nullable().optional(),
  party_size: z.number().int().min(1).max(100),
  starts_at: z.string().datetime({ offset: true }),
  zone_id: z.string().uuid().nullable().optional(),
  table_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

// Creates a booking from the website. Returns the reference, status and (if picked) table.
export const POST = route(async (req) => {
  const b = await readJson(req, input);
  const res = await db().query<{ r: unknown }>(
    "select create_booking($1, $2, $3, $4, $5, $6, $7, $8, false, $9) as r",
    [b.outlet, b.name, b.phone, b.email ?? null, b.party_size, b.starts_at, b.zone_id ?? null, b.notes ?? null, b.table_id ?? null]
  );
  return json(res.rows[0].r, 201);
});
