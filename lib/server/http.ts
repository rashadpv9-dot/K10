// Shared plumbing for the server routes: JSON responses, errors, request checks.
import { ZodError, type ZodType } from "zod";
import { DbUnavailable } from "./db";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

const MAX_BODY_BYTES = 32 * 1024;

/**
 * Changes must come from this site. Browsers always send Origin on POST/PATCH/PUT/DELETE,
 * so a request from another site (or with no Origin) is refused. Together with SameSite
 * cookies this blocks cross-site request forgery.
 */
export function checkOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new HttpError(403, "bad_origin");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "bad_origin");
  }
  if (originHost !== host) throw new HttpError(403, "bad_origin");
}

/** Reads and validates a JSON body. */
export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) throw new HttpError(415, "json_required");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "too_large");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json");
  }
  return schema.parse(raw);
}

// Short codes raised by the booking functions in the database (see db/migrations).
const BOOKING_CODES = new Set([
  "unknown_outlet",
  "invalid_name",
  "invalid_phone",
  "invalid_email",
  "invalid_party",
  "party_too_large",
  "outside_hours",
  "too_soon",
  "too_far",
  "too_many_bookings",
  "busy",
  "slot_full",
  "table_choice_off",
  "table_unsuitable",
  "table_taken",
  "no_table",
]);

type PgError = { code?: string; message?: string };

/** Wraps a route handler so every failure becomes a clean JSON error, never a stack trace. */
export function route<A extends unknown[]>(fn: (req: Request, ...args: A) => Promise<Response>) {
  return async (req: Request, ...args: A): Promise<Response> => {
    try {
      checkOrigin(req);
      return await fn(req, ...args);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.code }, err.status);
      if (err instanceof ZodError) return json({ error: "invalid_input", fields: err.issues.map((i) => i.path.join(".")) }, 400);
      if (err instanceof DbUnavailable) return json({ error: "database_unavailable" }, 503);
      const pg = err as PgError;
      if (pg.code === "P0001" && pg.message && BOOKING_CODES.has(pg.message)) return json({ error: pg.message }, 409);
      if (pg.code === "23P01") return json({ error: "table_taken" }, 409); // double booking refused
      if (pg.code === "23505") return json({ error: "duplicate" }, 409);
      if (pg.code === "23514" || pg.code === "22000" || pg.code === "22P02" || pg.code === "22007") return json({ error: "invalid_value" }, 400);
      if (pg.code === "ECONNREFUSED" || pg.code === "ENOTFOUND" || pg.code === "ETIMEDOUT" || /timeout|connect/i.test(pg.message ?? "")) {
        console.error("database connection failed", pg.message);
        return json({ error: "database_unavailable" }, 503);
      }
      console.error("unhandled error", err);
      return json({ error: "server_error" }, 500);
    }
  };
}
