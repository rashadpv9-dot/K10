// Runs the real schema and dummy data against an in-process Postgres (PGlite) and checks the
// guarantees the database itself must give: no double bookings, valid values, and the
// public booking function's rules.
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { clearDay, freshDb } from "./helpers";

const OUTLET = "00000000-0000-4000-8000-000000000010";
let db: PGlite;
let customerId: string;
let tableIds: Record<string, string>;

const insertBooking = (table: string | null, from: string, to: string, status = "confirmed") =>
  db.query<{ id: string }>(
    `insert into bookings (outlet_id, customer_id, table_id, party_size, starts_at, ends_at, status)
     values ($1, $2, $3, 2, $4, $5, $6) returning id`,
    [OUTLET, customerId, table ? tableIds[table] : null, `2026-10-16T${from}:00+03`, `2026-10-16T${to}:00+03`, status]
  );

beforeAll(async () => {
  db = await freshDb();
  const customer = await db.query<{ id: string }>(
    "insert into customers (outlet_id, name, phone) values ($1, 'Test Guest', '+97300000000') returning id",
    [OUTLET]
  );
  customerId = customer.rows[0].id;
  const tables = await db.query<{ id: string; label: string }>("select id, label from tables");
  tableIds = Object.fromEntries(tables.rows.map((t) => [t.label, t.id]));
});

describe("dummy data", () => {
  it("creates the outlet with the agreed default rules", async () => {
    const rules = await db.query<Record<string, unknown>>("select * from booking_rules where outlet_id = $1", [OUTLET]);
    expect(rules.rows[0]).toMatchObject({
      slot_minutes: 30,
      turn_minutes_small: 120,
      turn_minutes_large: 150,
      auto_confirm_max_party: 4,
      min_lead_minutes: 60,
      max_days_ahead: 30,
      deposit_mode: "groups",
      allow_table_choice: true,
    });
    expect(Object.keys(tableIds)).toHaveLength(9);
    expect((await db.query("select 1 from opening_hours where outlet_id = $1", [OUTLET])).rows).toHaveLength(7);
  });

  it("marks every dummy guest and booking as a sample, and creates no logins", async () => {
    const counts = await db.query<{ bookings: number; sample: number; guests: number; logins: number }>(
      `select (select count(*)::int from bookings) as bookings, (select count(*)::int from bookings where is_sample) as sample,
              (select count(*)::int from customers where not is_sample and name <> 'Test Guest') as guests,
              (select count(*)::int from staff_users) as logins`
    );
    expect(counts.rows[0]).toEqual({ bookings: 17, sample: 17, guests: 0, logins: 0 });
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
    await expect(db.query("update bookings set status = 'confirmed' where id = $1", [cancelled.rows[0].id])).rejects.toMatchObject({ code: "23P01" });
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
    await expect(insertBooking("T4", "21:00", "20:00")).rejects.toMatchObject({ code: "22000" });
    await expect(insertBooking("T4", "21:00", "21:00")).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query(`insert into tables (outlet_id, floor_plan_id, label, seats_min, seats_max) select outlet_id, floor_plan_id, 'BAD', 6, 2 from tables limit 1`)
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("stores one payment row per provider charge, so a repeated notification cannot duplicate it", async () => {
    const b = await insertBooking("T4", "19:00", "21:00");
    const pay = "insert into payments (booking_id, provider_charge_id, amount_fils) values ($1, 'chg_TEST_1', 20000)";
    await db.query(pay, [b.rows[0].id]);
    await expect(db.query(pay, [b.rows[0].id])).rejects.toMatchObject({ code: "23505" });
  });

  it("only accepts lower-case staff emails and stores no plain passwords", async () => {
    await expect(db.query("insert into staff_users (email, name, password_hash) values ('Boss@Example.com', 'Boss', 'x')")).rejects.toMatchObject({ code: "23514" });
    const cols = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'staff_users'");
    expect(cols.rows.map((c) => c.column_name)).not.toContain("password");
  });
});

describe("public booking function", () => {
  let day: string;
  const TERRACE = "00000000-0000-4000-8000-0000000000a2";
  const at = (time: string, date = day) => `${date}T${time}:00+03:00`;
  type Created = { reference: string; status: string; starts_at: string; ends_at: string; party_size: number; table?: string };

  const book = async (o: { phone: string; party?: number; time?: string; name?: string; zone?: string | null; email?: string | null; when?: string; table?: string | null }) => {
    const res = await db.query<{ r: Created }>("select create_booking('adliya', $1, $2, $3, $4, $5, $6, $7, false, $8) as r", [
      o.name ?? "Web Guest",
      o.phone,
      o.email ?? null,
      o.party ?? 2,
      o.when ?? at(o.time ?? "19:00"),
      o.zone ?? null,
      "From the website",
      o.table ? tableIds[o.table] : null,
    ]);
    return res.rows[0].r;
  };
  const tableOf = async (reference: string) =>
    (await db.query<{ label: string }>("select t.label from bookings b join tables t on t.id = b.table_id where b.reference = $1", [reference])).rows[0].label;

  beforeAll(async () => {
    day = await clearDay(db, 3);
  });

  it("gives the form table sizes, positions and busy times, but no personal details", async () => {
    const ctx = (await db.query<{ c: Record<string, any> }>("select booking_context('adliya', current_date) as c")).rows[0].c;
    expect(ctx.tables).toHaveLength(9);
    expect(ctx.zones).toHaveLength(2);
    expect(ctx.rules).toMatchObject({ auto_confirm_max_party: 4, slot_minutes: 30, allow_table_choice: true });
    expect(typeof ctx.tables[0].x).toBe("number");
    expect((ctx.busy as unknown[]).length).toBeGreaterThan(0);
    const text = JSON.stringify(ctx);
    for (const secret of ["+973", "Amina", "Anniversary", "@example.com"]) expect(text).not.toContain(secret);
  });

  it("confirms a small party instantly on the smallest free table", async () => {
    const res = await book({ phone: "+973 3111 0001" });
    expect(res.status).toBe("confirmed");
    expect(res.reference).toMatch(/^[0-9A-F]{8}$/);
    expect(await tableOf(res.reference)).toBe("T1");
    expect(new Date(res.ends_at).getTime() - new Date(res.starts_at).getTime()).toBe(120 * 60_000);
  });

  it("moves on to the next table when the first is taken", async () => {
    const second = await book({ phone: "+973 3111 0002" });
    const third = await book({ phone: "+973 3111 0003" });
    expect(await tableOf(second.reference)).toBe("T2");
    expect(["P1", "P2", "T3", "T4"]).toContain(await tableOf(third.reference));
  });

  it("sends a party over the instant-confirm limit to staff for approval", async () => {
    const res = await book({ phone: "+973 3111 0004", party: 6 });
    expect(res.status).toBe("pending_approval");
    expect(new Date(res.ends_at).getTime() - new Date(res.starts_at).getTime()).toBe(150 * 60_000);
  });

  it("keeps to the requested area", async () => {
    const res = await book({ phone: "+973 3111 0005", zone: TERRACE, time: "20:00" });
    expect(["P1", "P2"]).toContain(await tableOf(res.reference));
  });

  it("refuses when no suitable table is free", async () => {
    await book({ phone: "+973 3111 0006", party: 9, time: "21:00" }); // only T6 seats nine
    await expect(book({ phone: "+973 3111 0007", party: 9, time: "21:30" })).rejects.toThrow(/no_table/);
  });

  it("refuses times that are not real slots", async () => {
    await expect(book({ phone: "+973 3111 0008", time: "19:10" })).rejects.toThrow(/outside_hours/);
    await expect(book({ phone: "+973 3111 0008", time: "08:00" })).rejects.toThrow(/outside_hours/);
    await expect(book({ phone: "+973 3111 0008", time: "00:30" })).rejects.toThrow(/outside_hours/);
    await expect(book({ phone: "+973 3111 0008", when: new Date(Date.now() + 10 * 60_000).toISOString() })).rejects.toThrow(/too_soon/);
    await expect(book({ phone: "+973 3111 0008", when: new Date(Date.now() + 60 * 86_400_000).toISOString() })).rejects.toThrow(/too_far/);
  });

  it("accepts a slot after midnight that belongs to the evening before", async () => {
    const next = (await db.query<{ d: string }>("select ($1::date + 1)::text as d", [day])).rows[0].d;
    expect((await book({ phone: "+973 3111 0009", when: at("00:00", next) })).status).toBe("confirmed");
  });

  it("refuses bad details and oversized parties", async () => {
    await expect(book({ phone: "+973 3111 0010", party: 13 })).rejects.toThrow(/party_too_large/);
    await expect(book({ phone: "+973 3111 0010", party: 0 })).rejects.toThrow(/invalid_party/);
    await expect(book({ phone: "abc" })).rejects.toThrow(/invalid_phone/);
    await expect(book({ phone: "+973 3111 0010", name: "x" })).rejects.toThrow(/invalid_name/);
    await expect(book({ phone: "+973 3111 0010", email: "not-an-email" })).rejects.toThrow(/invalid_email/);
    await expect(db.query("select create_booking('nowhere', 'Web Guest', '+973 3111 0010', null, 2, $1)", [at("19:00")])).rejects.toThrow(/unknown_outlet/);
  });

  it("limits one phone number to three upcoming bookings", async () => {
    const phone = "+973 3111 0011";
    for (const time of ["13:00", "15:30", "22:00"]) await book({ phone, time });
    await expect(book({ phone, time: "17:30" })).rejects.toThrow(/too_many_bookings/);
  });

  describe("with a table chosen by the customer", () => {
    let pickDay: string;
    const pick = (phone: string, table: string, o: { party?: number; time?: string } = {}) =>
      book({ phone, table, party: o.party, when: at(o.time ?? "19:00", pickDay) });
    const allow = (on: boolean) => db.query("update booking_rules set allow_table_choice = $1", [on]);

    beforeAll(async () => {
      pickDay = await clearDay(db, 8);
    });

    it("refuses a chosen table when the outlet has the option switched off", async () => {
      await allow(false);
      await expect(pick("+973 3222 0001", "T3")).rejects.toThrow(/table_choice_off/);
      await allow(true);
    });

    it("books exactly the table the customer picked", async () => {
      expect(await pick("+973 3222 0002", "T4")).toMatchObject({ status: "confirmed", table: "T4" });
    });

    it("refuses a picked table that is already taken, saving nothing", async () => {
      await expect(pick("+973 3222 0003", "T4", { time: "20:00" })).rejects.toThrow(/table_taken/);
      expect((await db.query("select 1 from customers where phone = '+973 3222 0003'")).rows).toHaveLength(0);
    });

    it("refuses a table that is the wrong size or switched off", async () => {
      await expect(pick("+973 3222 0004", "T1", { party: 4 })).rejects.toThrow(/table_unsuitable/);
      await expect(pick("+973 3222 0004", "T6", { party: 2 })).rejects.toThrow(/table_unsuitable/);
      await db.query("update tables set is_active = false where label = 'P2'");
      await expect(pick("+973 3222 0004", "P2")).rejects.toThrow(/table_unsuitable/);
      await db.query("update tables set is_active = true where label = 'P2'");
    });
  });
});
