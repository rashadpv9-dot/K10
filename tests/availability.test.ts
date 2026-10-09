import { describe, expect, it } from "vitest";
import {
  depositFils,
  initialStatus,
  listSlots,
  localDate,
  localToUtc,
  parseTime,
  pickTable,
  serviceWindow,
  weekdayOf,
  type ExistingBooking,
  type Rules,
  type Table,
} from "../lib/booking/availability";

const OFFSET = 180; // Bahrain, UTC+3
const HOURS = { opens: "12:00", closes: "02:00", isClosed: false };
const DATE = "2026-10-16"; // a Friday

const rules: Rules = {
  slotMinutes: 30,
  turnMinutesSmall: 120,
  turnMinutesLarge: 150,
  largePartyFrom: 5,
  maxPartyOnline: 12,
  maxCoversPerSlot: null,
  minLeadMinutes: 60,
  maxDaysAhead: 30,
  autoConfirmMaxParty: 4,
  depositMode: "groups",
  depositPerGuestFils: 5000,
  holdMinutes: 10,
};

const table = (id: string, seatsMin: number, seatsMax: number, zoneId: string | null = "indoor"): Table => ({
  id,
  label: id,
  zoneId,
  seatsMin,
  seatsMax,
  isActive: true,
});
const tables: Table[] = [table("T1", 1, 2), table("T3", 2, 4), table("T5", 4, 6), table("P1", 2, 4, "terrace")];

// Local Bahrain time on DATE → UTC instant.
const at = (time: string, date = DATE) => localToUtc(date, parseTime(time), OFFSET);
const booking = (tableId: string, from: string, to: string, extra: Partial<ExistingBooking> = {}): ExistingBooking => ({
  tableId,
  partySize: 2,
  startsAt: at(from),
  endsAt: at(to),
  status: "confirmed",
  holdExpiresAt: null,
  ...extra,
});

const now = at("09:00", "2026-10-10");
const slotsFor = (overrides: Partial<Parameters<typeof listSlots>[0]> = {}) =>
  listSlots({ date: DATE, partySize: 2, hours: HOURS, rules, tables, bookings: [], now, utcOffsetMinutes: OFFSET, ...overrides });
const slotAt = (label: string, overrides: Partial<Parameters<typeof listSlots>[0]> = {}) => slotsFor(overrides).find((s) => s.label === label)!;

describe("time handling", () => {
  it("parses times with or without seconds", () => {
    expect(parseTime("12:00")).toBe(720);
    expect(parseTime("02:30:00")).toBe(150);
    expect(() => parseTime("25:00")).toThrow();
    expect(() => parseTime("noon")).toThrow();
  });

  it("converts Bahrain local time to UTC", () => {
    expect(at("12:00").toISOString()).toBe("2026-10-16T09:00:00.000Z");
    expect(localDate(new Date("2026-10-16T22:30:00Z"), OFFSET)).toBe("2026-10-17");
    expect(weekdayOf(DATE)).toBe(5);
  });

  it("treats a closing time before opening as the next day", () => {
    const window = serviceWindow(DATE, HOURS, OFFSET)!;
    expect(window.open.toISOString()).toBe("2026-10-16T09:00:00.000Z");
    expect(window.close.toISOString()).toBe("2026-10-16T23:00:00.000Z"); // 2 AM on the 17th, local
    expect(serviceWindow(DATE, { ...HOURS, isClosed: true }, OFFSET)).toBeNull();
  });
});

describe("listSlots", () => {
  it("offers every half hour until a full sitting still fits before closing", () => {
    const slots = slotsFor();
    expect(slots).toHaveLength(25);
    expect(slots[0].label).toBe("12:00 PM");
    expect(slots.at(-1)!.label).toBe("12:00 AM");
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it("gives larger parties a longer sitting, so their last slot is earlier", () => {
    const slots = slotsFor({ partySize: 6 });
    expect(slots.at(-1)!.label).toBe("11:30 PM");
    expect(slots[0].end.getTime() - slots[0].start.getTime()).toBe(150 * 60_000);
  });

  it("returns nothing on closed days, closure dates and for parties too large to book online", () => {
    expect(slotsFor({ hours: { ...HOURS, isClosed: true } })).toEqual([]);
    expect(slotsFor({ closedDates: [DATE] })).toEqual([]);
    expect(slotsFor({ partySize: 13 })).toEqual([]);
    expect(slotsFor({ partySize: 0 })).toEqual([]);
  });

  it("blocks times inside the minimum notice period", () => {
    const sameDay = at("18:15");
    expect(slotAt("7:00 PM", { now: sameDay }).reason).toBe("too_soon");
    expect(slotAt("7:30 PM", { now: sameDay }).available).toBe(true);
  });

  it("blocks dates beyond the booking window", () => {
    const early = at("09:00", "2026-09-01");
    expect(slotAt("7:00 PM", { now: early }).reason).toBe("too_far");
    expect(slotAt("7:00 PM", { now: at("09:00", "2026-09-16") }).available).toBe(true);
  });

  it("enforces the maximum guests arriving in one slot", () => {
    const capped = { ...rules, maxCoversPerSlot: 6 };
    const bookings = [booking("T3", "19:00", "21:00", { partySize: 4 })];
    expect(slotAt("7:00 PM", { rules: capped, bookings, partySize: 3 }).reason).toBe("slot_full");
    expect(slotAt("7:00 PM", { rules: capped, bookings, partySize: 2 }).available).toBe(true);
    expect(slotAt("7:30 PM", { rules: capped, bookings, partySize: 3 }).available).toBe(true);
  });
});

describe("table assignment", () => {
  const pick = (partySize: number, from: string, to: string, bookings: ExistingBooking[] = [], zoneId?: string) =>
    pickTable({ partySize, start: at(from), end: at(to), zoneId, tables, bookings, now })?.id ?? null;

  it("gives a party the smallest table that fits", () => {
    expect(pick(2, "19:00", "21:00")).toBe("T1");
    expect(pick(3, "19:00", "21:00")).toBe("P1");
    expect(pick(5, "19:00", "21:30")).toBe("T5");
    expect(pick(7, "19:00", "21:30")).toBeNull();
  });

  it("skips a table that is taken for any part of the sitting", () => {
    expect(pick(2, "20:00", "22:00", [booking("T1", "19:00", "21:00")])).toBe("P1");
  });

  it("allows back-to-back sittings on the same table", () => {
    expect(pick(2, "21:00", "23:00", [booking("T1", "19:00", "21:00")])).toBe("T1");
  });

  it("ignores cancelled bookings and payment holds that have run out", () => {
    expect(pick(2, "19:00", "21:00", [booking("T1", "19:00", "21:00", { status: "cancelled" })])).toBe("T1");
    const expired = booking("T1", "19:00", "21:00", { status: "pending_payment", holdExpiresAt: new Date(now.getTime() - 1) });
    const held = booking("T1", "19:00", "21:00", { status: "pending_payment", holdExpiresAt: new Date(now.getTime() + 60_000) });
    expect(pick(2, "19:00", "21:00", [expired])).toBe("T1");
    expect(pick(2, "19:00", "21:00", [held])).toBe("P1");
  });

  it("keeps to the requested zone and to active tables", () => {
    expect(pick(2, "19:00", "21:00", [], "terrace")).toBe("P1");
    expect(pick(6, "19:00", "21:30", [], "terrace")).toBeNull();
    const closedT1 = tables.map((t) => (t.id === "T1" ? { ...t, isActive: false } : t));
    expect(pickTable({ partySize: 2, start: at("19:00"), end: at("21:00"), tables: closedT1, bookings: [], now })?.id).toBe("P1");
  });

  it("marks a slot unavailable when every suitable table is taken", () => {
    const bookings = [booking("T5", "18:00", "20:30", { partySize: 5 })];
    expect(slotAt("7:00 PM", { partySize: 5, bookings }).reason).toBe("no_table");
    expect(slotAt("8:30 PM", { partySize: 5, bookings }).tableId).toBe("T5");
  });
});

describe("confirmation and deposits", () => {
  it("confirms up to 4 guests instantly and sends larger parties to staff", () => {
    expect(initialStatus(4, rules)).toBe("confirmed");
    expect(initialStatus(5, rules)).toBe("pending_approval");
  });

  it("charges a deposit only to groups by default", () => {
    expect(depositFils(4, rules)).toBe(0);
    expect(depositFils(6, rules)).toBe(30_000);
  });

  it("holds the table for payment when everyone pays a deposit", () => {
    const all = { ...rules, depositMode: "all" as const };
    expect(depositFils(2, all)).toBe(10_000);
    expect(initialStatus(2, all)).toBe("pending_payment");
    expect(initialStatus(6, all)).toBe("pending_approval");
  });

  it("charges nothing when deposits are off", () => {
    const none = { ...rules, depositMode: "none" as const };
    expect(depositFils(8, none)).toBe(0);
    expect(initialStatus(2, none)).toBe("confirmed");
  });
});
