// Server-side database access (Neon Postgres in production).
// Never imported by browser code: every query runs inside the site's server routes.
import { Pool } from "pg";

export type QueryResult<T> = { rows: T[] };
export type Db = { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>> };

export class DbUnavailable extends Error {}

let override: Db | null = null;

/** Tests swap in an in-process database; production uses DATABASE_URL. */
export function setDbForTests(db: Db | null) {
  override = db;
}

const globalForDb = globalThis as unknown as { k10Pool?: Pool };

export function db(): Db {
  if (override) return override;
  const url = process.env.DATABASE_URL;
  if (!url) throw new DbUnavailable("DATABASE_URL is not set");
  // One pool per server instance; reused across requests and across hot reloads in development.
  globalForDb.k10Pool ??= new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 10_000,
  });
  return globalForDb.k10Pool as unknown as Db;
}
