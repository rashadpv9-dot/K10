// Calls the real server route handlers against an in-process database and checks sign-in,
// sessions, roles, outlet isolation, cross-site request blocking and the public booking path.
import type { PGlite } from "@electric-sql/pglite";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as login from "@/app/api/auth/login/route";
import * as logout from "@/app/api/auth/logout/route";
import * as me from "@/app/api/auth/me/route";
import * as outlet from "@/app/api/admin/outlet/route";
import * as bookings from "@/app/api/admin/bookings/route";
import * as booking from "@/app/api/admin/bookings/[id]/route";
import * as rules from "@/app/api/admin/rules/route";
import * as tables from "@/app/api/admin/tables/route";
import * as floorPlan from "@/app/api/admin/floor-plan/route";
import * as availability from "@/app/api/public/availability/route";
import * as publicBookings from "@/app/api/public/bookings/route";
import { setDbForTests } from "@/lib/server/db";
import { clearDay, freshDb } from "./helpers";

const ORIGIN = "http://localhost:3000";
const OTHER_OUTLET = "00000000-0000-4000-8000-000000000099";
const PASSWORD = "correct horse battery staple";
let db: PGlite;

type Handler = (req: Request, ctx?: any) => Promise<Response>;
async function call(handler: Handler, o: { method?: string; path?: string; body?: unknown; cookie?: string; origin?: string | null; id?: string } = {}) {
  const headers: Record<string, string> = { host: "localhost:3000", "x-forwarded-host": "localhost:3000" };
  if (o.origin !== null) headers.origin = o.origin ?? ORIGIN;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const req = new Request(`${ORIGIN}${o.path ?? "/api/x"}`, {
    method: o.method ?? (o.body === undefined ? "GET" : "POST"),
    headers,
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  const res = await handler(req, o.id ? { params: Promise.resolve({ id: o.id }) } : undefined);
  return { status: res.status, body: (await res.json()) as any, setCookie: res.headers.get("set-cookie") ?? "" };
}

async function signIn(email: string, password = PASSWORD) {
  const res = await call(login.POST, { body: { email, password } });
  return { ...res, cookie: res.setCookie.split(";")[0] };
}

beforeAll(async () => {
  db = await freshDb();
  setDbForTests({ query: (text, params) => db.query(text, params as unknown[]) as never });
  const hash = await bcrypt.hash(PASSWORD, 4);
  for (const [email, role] of [["owner@test.bh", "owner"], ["manager@test.bh", "manager"], ["host@test.bh", "host"], ["locked@test.bh", "host"]]) {
    const u = await db.query<{ id: string }>("insert into staff_users (email, name, password_hash) values ($1, $1, $2) returning id", [email, hash]);
    await db.query("insert into staff (user_id, outlet_id, role) select $1, id, $2 from outlets where slug = 'adliya'", [u.rows[0].id, role]);
  }
  // A second outlet with one booking, to prove staff cannot reach another outlet's data.
  await db.query("insert into outlets (id, slug, name) values ($1, 'elsewhere', 'Another outlet')", [OTHER_OUTLET]);
  const c = await db.query<{ id: string }>("insert into customers (outlet_id, name, phone) values ($1, 'Other Guest', '+97399990000') returning id", [OTHER_OUTLET]);
  await db.query(
    "insert into bookings (outlet_id, customer_id, party_size, starts_at, ends_at, status) values ($1, $2, 2, now() + interval '1 day', now() + interval '1 day 2 hours', 'confirmed')",
    [OTHER_OUTLET, c.rows[0].id]
  );
});

afterAll(() => setDbForTests(null));

describe("sign-in", () => {
  it("refuses a wrong password or unknown email with the same answer", async () => {
    expect(await call(login.POST, { body: { email: "host@test.bh", password: "nope" } })).toMatchObject({ status: 401, body: { error: "wrong_credentials" } });
    expect(await call(login.POST, { body: { email: "nobody@test.bh", password: "nope" } })).toMatchObject({ status: 401, body: { error: "wrong_credentials" } });
  });

  it("signs in with an HttpOnly, SameSite cookie and stores only a hash of the token", async () => {
    const res = await signIn("HOST@test.bh");
    expect(res.status).toBe(200);
    expect(res.body.staff).toMatchObject({ email: "host@test.bh", role: "host" });
    expect(res.setCookie).toMatch(/HttpOnly/);
    expect(res.setCookie).toMatch(/SameSite=Lax/);
    const token = res.cookie.split("=")[1];
    const stored = await db.query("select 1 from sessions where token_hash = $1", [token]);
    expect(stored.rows).toHaveLength(0);
    expect((await call(me.GET, { cookie: res.cookie })).body.staff.role).toBe("host");
  });

  it("locks a login after repeated wrong passwords, even for the right one", async () => {
    for (let i = 0; i < 8; i++) await call(login.POST, { body: { email: "locked@test.bh", password: "wrong" } });
    expect(await call(login.POST, { body: { email: "locked@test.bh", password: PASSWORD } })).toMatchObject({ status: 429, body: { error: "locked" } });
  });

  it("ends the session on sign-out, and refuses expired sessions", async () => {
    const { cookie } = await signIn("manager@test.bh");
    await call(logout.POST, { cookie, body: {} });
    expect((await call(me.GET, { cookie })).status).toBe(401);

    const again = await signIn("manager@test.bh");
    await db.query("update sessions set expires_at = now() - interval '1 minute'");
    expect((await call(outlet.GET, { cookie: again.cookie })).status).toBe(401);
  });
});

describe("cross-site protection", () => {
  it("refuses changes without an Origin header or from another site", async () => {
    expect(await call(login.POST, { body: { email: "host@test.bh", password: PASSWORD }, origin: null })).toMatchObject({ status: 403, body: { error: "bad_origin" } });
    expect(await call(login.POST, { body: { email: "host@test.bh", password: PASSWORD }, origin: "https://evil.example" })).toMatchObject({ status: 403 });
  });
});

describe("admin access", () => {
  let host: string;
  let manager: string;
  beforeAll(async () => {
    host = (await signIn("host@test.bh")).cookie;
    manager = (await signIn("manager@test.bh")).cookie;
  });

  it("needs a signed-in staff member", async () => {
    expect((await call(outlet.GET)).status).toBe(401);
    expect((await call(bookings.GET, { path: `/api/admin/bookings?from=${new Date().toISOString()}` })).status).toBe(401);
  });

  it("gives staff their outlet with tables as numbers", async () => {
    const res = await call(outlet.GET, { cookie: host });
    expect(res.status).toBe(200);
    expect(res.body.tables).toHaveLength(9);
    expect(typeof res.body.tables[0].x).toBe("number");
    expect(res.body.role).toBe("host");
  });

  it("lets only managers and owners change rules and tables", async () => {
    expect(await call(rules.PATCH, { method: "PATCH", cookie: host, body: { max_days_ahead: 45 } })).toMatchObject({ status: 403, body: { error: "role_not_allowed" } });
    const ok = await call(rules.PATCH, { method: "PATCH", cookie: manager, body: { max_days_ahead: 45 } });
    expect(ok.status).toBe(200);
    expect(ok.body.rules.max_days_ahead).toBe(45);
    expect((await call(tables.POST, { cookie: host, body: { label: "X1", seats_min: 1, seats_max: 2, shape: "round", zone_id: null, x: 5, y: 5, w: 6, h: 6, rotation: 0, is_active: true } })).status).toBe(403);
  });

  it("rejects malformed input", async () => {
    expect(await call(rules.PATCH, { method: "PATCH", cookie: manager, body: { slot_minutes: 7 } })).toMatchObject({ status: 400, body: { error: "invalid_input" } });
  });

  it("lets a host update bookings in their outlet only", async () => {
    const from = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const list = await call(bookings.GET, { cookie: host, path: `/api/admin/bookings?from=${encodeURIComponent(from)}` });
    expect(list.status).toBe(200);
    expect(list.body.bookings.every((b: any) => b.customer.name !== "Other Guest")).toBe(true);
    const pending = list.body.bookings.find((b: any) => b.status === "pending_approval");
    expect(await call(booking.PATCH, { method: "PATCH", cookie: host, id: pending.id, body: { status: "confirmed" } })).toMatchObject({ status: 200 });

    const other = await db.query<{ id: string }>("select id from bookings where outlet_id = $1", [OTHER_OUTLET]);
    expect(await call(booking.PATCH, { method: "PATCH", cookie: host, id: other.rows[0].id, body: { status: "cancelled" } })).toMatchObject({ status: 404 });
  });

  it("refuses a staff booking on a table that is already taken", async () => {
    const taken = await db.query<{ table_id: string; starts_at: Date }>(
      "select table_id, starts_at from bookings where status = 'confirmed' and table_id is not null and starts_at > now() order by starts_at limit 1"
    );
    const res = await call(bookings.POST, {
      cookie: host,
      body: { name: "Walk In", phone: "+973 3555 0001", party_size: 2, starts_at: taken.rows[0].starts_at.toISOString(), table_id: taken.rows[0].table_id, source: "walk_in" },
    });
    expect(res).toMatchObject({ status: 409, body: { error: "table_taken" } });
  });

  it("explains when image storage is not connected", async () => {
    const res = await call(floorPlan.POST, { cookie: manager, body: {} });
    expect(res).toMatchObject({ status: 503, body: { error: "storage_not_configured" } });
  });
});

describe("public booking", () => {
  it("shares free-time data without personal details", async () => {
    const day = await clearDay(db, 0);
    const res = await call(availability.GET, { path: `/api/public/availability?date=${day}` });
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    for (const secret of ["+973", "Amina", "Anniversary", "@example.com", "password"]) expect(text).not.toContain(secret);
  });

  it("creates a booking, and turns rule failures into short codes", async () => {
    const day = await clearDay(db, 4);
    const ok = await call(publicBookings.POST, { body: { name: "Web Guest", phone: "+973 3666 0001", party_size: 2, starts_at: `${day}T19:00:00+03:00` } });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe("confirmed");
    const big = await call(publicBookings.POST, { body: { name: "Web Guest", phone: "+973 3666 0002", party_size: 20, starts_at: `${day}T19:00:00+03:00` } });
    expect(big).toMatchObject({ status: 409, body: { error: "party_too_large" } });
  });
});
