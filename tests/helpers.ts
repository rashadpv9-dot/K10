// Shared test helpers: a fresh in-process database with the real schema and dummy data.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

export const sqlFile = (file: string) => readFileSync(resolve(__dirname, "..", "db", file), "utf8");

/** A fresh database with the schema and dummy data loaded. */
export async function freshDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(sqlFile("migrations/0001_init.sql"));
  await db.exec(sqlFile("seed.sql"));
  return db;
}

/** A date `ahead` days from today on the outlet's clock, skipping 2026-10-16 (used by fixed-date tests). */
export async function clearDay(db: PGlite, ahead: number): Promise<string> {
  const res = await db.query<{ d: string }>(
    `select case when d = date '2026-10-16' then (d + 1)::text else d::text end as d
     from (select ((now() at time zone 'UTC') + interval '3 hours')::date + $1::int as d) q`,
    [ahead]
  );
  return res.rows[0].d;
}

