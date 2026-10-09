// Runs the real migration and seed against an in-process Postgres (PGlite) and checks the
// guarantees the database itself must give: no double bookings, and no data for the wrong people.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { beforeAll, describe, expect, it } from "vitest";

const sql = (file: string) => readFileSync(resolve(__dirname, "..", "supabase", file), "utf8");

const OUTLET = "00000000-0000-4000-8000-000000000010";
const USERS = {
  owner: "00000000-0000-4000-8000-0000000000b1",
  manager: "00000000-0000-4000-8000-0000000000b2",
  host: "00000000-0000-4000-8000-0000000000b3",
  stranger: "00000000-0000-4000-8000-0000000000b4",
};

let db: PGlite;
let customerId: string;
let tableIds: Record<string, string>;

// Stand-ins for what Supabase provides: its roles, the auth schema and auth.uid().
const SUPABASE_STUB = `
  create schema if not exists extensions;
  create schema auth;
  create table auth.users (id uuid primary key);
  create role anon nologin;
  create role authenticated nologin;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth, extensions to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  set search_path to public, extensions;
`;

/** Runs a callback as a signed-in user (or as the anonymous public when userId is null). */
async function as<T>(userId: string | null, run: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ""}', false); set role ${userId ? "authenticated" : "anon"};`);
  try {
    return await run();
  } finally {
    await db.exec("reset role");
  }
}

const insertBooking = (table: string | null, from: string, to: string, status = "confirmed") =>
  db.query<{ id: string }>(
    `insert into public.bookings (outlet_id, customer_id, table_id, party_size, starts_at, ends_at, status)
     values ($1, $2, $3, 2, $4, $5, $6) returning id`,
    [OUTLET, customerId, table ? tableIds[table] : null, `2026-10-16T${from}:00+03`, `2026-10-16T${to}:00+03`, status]
  );

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(SUPABASE_STUB);
  await db.exec(sql("migrations/0001_booking_core.sql"));
  await db.exec(sql("seed.sql"));

  for (const id of Object.values(USERS)) await db.query("insert into auth.users (id) values ($1)", [id]);
  for (const role of ["owner", "manager", "host"] as const) {
    await db.query("insert into public.staff (user_id, outlet_id, role) values ($1, $2, $3)", [USERS[role], OUTLET, role]);
  }
  const customer = await db.query<{ id: string }>(
    "insert into public.customers (outlet_id, name, phone) values ($1, 'Test Guest', '+97300000000') returning id",
    [OUTLET]
  );
  customerId = customer.rows[0].id;
  const tables = await db.query<{ id: string; label: string }>("select id, label from public.tables");
  tableIds = Object.fromEntries(tables.rows.map((t) => [t.label, t.id]));
});

describe("seed data", () => {
  it("creates the outlet with the agreed default rules", async () => {
    const rules = await db.query<Record<string, unknown>>("select * from public.booking_rules where outlet_id = $1", [OUTLET]);
    expect(rules.rows[0]).toMatchObject({
      slot_minutes: 30,
      turn_minutes_small: 120,
      turn_minutes_large: 150,
      auto_confirm_max_party: 4,
      min_lead_minutes: 60,
      max_days_ahead: 30,
      deposit_mode: "groups",
    });
    expect(Object.keys(tableIds)).toHaveLength(9);
    const hours = await db.query("select 1 from public.opening_hours where outlet_id = $1", [OUTLET]);
    expect(hours.rows).toHaveLength(7);
  });
});

describe("double-booking protection", () => {
  it("refuses a second live booking that overlaps on the same table", async () => {
    await insertBooking("T1", "19:00", "21:00");
    await expect(insertBooking("T1", "20:00", "22:00")).rejects.toMatchObject({ code: "23P01" });
    await expect(insertBooking("T1", "18:00", "19:30", "pending_approval")).rejects.toMatchObject({ code: "23P01" });
  });

  it("allows back-to-back bookings and other tables at the same time", async () => {
    await expect(insertBooking("T1", "21:00", "23:00")).resolves.toBeTruthy();
    await expect(insertBooking("T2", "19:00", "21:00")).resolves.toBeTruthy();
  });

  it("lets a cancelled booking overlap, but not be revived into a clash", async () => {
    const cancelled = await insertBooking("T1", "19:30", "20:30", "cancelled");
    await expect(
      db.query("update public.bookings set status = 'confirmed' where id = $1", [cancelled.rows[0].id])
    ).rejects.toMatchObject({ code: "23P01" });
  });

  it("lets only one of two simultaneous requests for the same table win", async () => {
    const results = await Promise.allSettled([insertBooking("T3", "19:00", "21:00"), insertBooking("T3", "19:00", "21:00")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("does not block bookings that have no table yet", async () => {
    await expect(insertBooking(null, "19:00", "21:00", "pending_approval")).resolves.toBeTruthy();
    await expect(insertBooking(null, "19:00", "21:00", "pending_approval")).resolves.toBeTruthy();
  });
});

describe("data rules", () => {
  it("rejects impossible tables and bookings", async () => {
    // Ending before it starts is refused when the time range is built (22000);
    // a zero-length booking is refused by the ends_at > starts_at check (23514).
    await expect(insertBooking("T4", "21:00", "20:00")).rejects.toMatchObject({ code: "22000" });
    await expect(insertBooking("T4", "21:00", "21:00")).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query(
        `insert into public.tables (outlet_id, floor_plan_id, label, seats_min, seats_max)
         select outlet_id, floor_plan_id, 'BAD', 6, 2 from public.tables limit 1`
      )
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("stores one payment row per provider charge, so a repeated notification cannot duplicate it", async () => {
    const b = await insertBooking("T4", "19:00", "21:00");
    const pay = "insert into public.payments (booking_id, provider_charge_id, amount_fils) values ($1, 'chg_TEST_1', 20000)";
    await db.query(pay, [b.rows[0].id]);
    await expect(db.query(pay, [b.rows[0].id])).rejects.toMatchObject({ code: "23505" });
  });
});

describe("access control", () => {
  it("gives the anonymous public no access to any table", async () => {
    for (const t of ["bookings", "customers", "payments", "staff", "booking_rules", "tables", "outlets", "audit_log"]) {
      await expect(as(null, () => db.query(`select * from public.${t}`)), t).rejects.toMatchObject({ code: "42501" });
    }
    await expect(
      as(null, () => db.query("insert into public.customers (outlet_id, name, phone) values ($1, 'x', '+97311111111')", [OUTLET]))
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("shows a signed-in user who is not staff nothing", async () => {
    for (const t of ["bookings", "customers", "payments", "staff", "booking_rules", "tables", "outlets"]) {
      const res = await as(USERS.stranger, () => db.query(`select * from public.${t}`));
      expect(res.rows, t).toHaveLength(0);
    }
    await expect(
      as(USERS.stranger, () =>
        db.query("insert into public.customers (outlet_id, name, phone) values ($1, 'x', '+97322222222')", [OUTLET])
      )
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("lets a host work with bookings and customers", async () => {
    const bookings = await as(USERS.host, () => db.query("select id from public.bookings"));
    expect(bookings.rows.length).toBeGreaterThan(0);
    const updated = await as(USERS.host, () =>
      db.query("update public.bookings set notes = 'window seat' where table_id = $1 returning id", [tableIds.T2])
    );
    expect(updated.rows).toHaveLength(1);
  });

  it("stops a host changing rules, layout or staff, and from deleting bookings", async () => {
    const rules = await as(USERS.host, () => db.query("update public.booking_rules set auto_confirm_max_party = 20 returning outlet_id"));
    expect(rules.rows).toHaveLength(0);
    const tables = await as(USERS.host, () => db.query("update public.tables set seats_max = 50 returning id"));
    expect(tables.rows).toHaveLength(0);
    await expect(
      as(USERS.host, () => db.query("insert into public.staff (user_id, outlet_id, role) values ($1, $2, 'owner')", [USERS.stranger, OUTLET]))
    ).rejects.toMatchObject({ code: "42501" });
    await expect(as(USERS.host, () => db.query("delete from public.bookings"))).rejects.toMatchObject({ code: "42501" });

    const check = await db.query<{ auto_confirm_max_party: number }>("select auto_confirm_max_party from public.booking_rules");
    expect(check.rows[0].auto_confirm_max_party).toBe(4);
  });

  it("lets a manager change rules and layout but not manage staff", async () => {
    const rules = await as(USERS.manager, () => db.query("update public.booking_rules set max_days_ahead = 45 returning outlet_id"));
    expect(rules.rows).toHaveLength(1);
    await expect(
      as(USERS.manager, () => db.query("insert into public.staff (user_id, outlet_id, role) values ($1, $2, 'host')", [USERS.stranger, OUTLET]))
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("keeps payments read-only for staff: managers can see them, hosts cannot, nobody can write", async () => {
    const asHost = await as(USERS.host, () => db.query("select id from public.payments"));
    expect(asHost.rows).toHaveLength(0);
    const asManager = await as(USERS.manager, () => db.query("select id from public.payments"));
    expect(asManager.rows).toHaveLength(1);
    for (const user of [USERS.host, USERS.manager, USERS.owner]) {
      await expect(as(user, () => db.query("update public.payments set amount_fils = 1"))).rejects.toMatchObject({ code: "42501" });
      await expect(as(user, () => db.query("delete from public.payments"))).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("lets only the owner add staff", async () => {
    const added = await as(USERS.owner, () =>
      db.query("insert into public.staff (user_id, outlet_id, role) values ($1, $2, 'host') returning user_id", [USERS.stranger, OUTLET])
    );
    expect(added.rows).toHaveLength(1);
  });
});
