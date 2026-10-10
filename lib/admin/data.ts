// Admin data layer: Supabase browser client, row types and small helpers.
// Access is enforced by the database's row level security, not by this code.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  localDate,
  localToUtc,
  type BookingStatus,
  type DayHours,
  type ExistingBooking,
  type Rules,
  type Table,
} from "@/lib/booking/availability";

export { supabase } from "@/lib/supabase";

export type Role = "owner" | "manager" | "host";
export type Outlet = { id: string; name: string; slug: string; utc_offset_minutes: number; currency: string };
export type Zone = { id: string; name: string; sort: number };
export type FloorPlan = { id: string; name: string; image_path: string | null; image_width: number | null; image_height: number | null };
export type TableRow = {
  id: string;
  outlet_id: string;
  floor_plan_id: string;
  zone_id: string | null;
  label: string;
  seats_min: number;
  seats_max: number;
  shape: "round" | "square" | "rect" | "booth" | "bar";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  is_active: boolean;
};
export type RulesRow = {
  outlet_id: string;
  slot_minutes: number;
  turn_minutes_small: number;
  turn_minutes_large: number;
  large_party_from: number;
  max_party_online: number;
  max_covers_per_slot: number | null;
  min_lead_minutes: number;
  max_days_ahead: number;
  auto_confirm_max_party: number;
  allow_table_choice: boolean;
  deposit_mode: "none" | "groups" | "all";
  deposit_per_guest_fils: number;
  hold_minutes: number;
};
export type HoursRow = { outlet_id: string; weekday: number; opens: string; closes: string; is_closed: boolean };
export type BookingRow = {
  id: string;
  reference: string;
  table_id: string | null;
  zone_id: string | null;
  party_size: number;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  source: "online" | "phone" | "walk_in";
  notes: string | null;
  is_sample: boolean;
  customer: { id: string; name: string; phone: string; email: string | null } | null;
  table: { id: string; label: string } | null;
};

export const BOOKING_SELECT =
  "id, reference, table_id, zone_id, party_size, starts_at, ends_at, status, source, notes, is_sample, customer:customers(id, name, phone, email), table:tables(id, label)";

export type Ctx = {
  sb: SupabaseClient;
  outlet: Outlet;
  role: Role;
  canManage: boolean;
  rules: RulesRow;
  hours: HoursRow[];
  zones: Zone[];
  plan: FloorPlan;
  tables: TableRow[];
  reload: () => Promise<void>;
};

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: "Awaiting payment",
  pending_approval: "Needs approval",
  confirmed: "Confirmed",
  seated: "Seated",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  no_show: "No-show",
  expired: "Expired",
};
export const LIVE_STATUSES: BookingStatus[] = ["pending_payment", "pending_approval", "confirmed", "seated"];
export const SOURCE_LABEL = { online: "Online", phone: "Phone", walk_in: "Walk-in" } as const;
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const HOUR = 3_600_000;
// A "service day" runs 6 AM to 6 AM, so bookings after midnight stay with the evening they belong to.
const DAY_STARTS_AT_MINUTES = 6 * 60;

/** The service day (YYYY-MM-DD) an instant belongs to. */
export function serviceDay(at: Date, offset: number): string {
  return localDate(new Date(at.getTime() - DAY_STARTS_AT_MINUTES * 60_000), offset);
}

/** UTC bounds of a service day, as ISO strings for queries. */
export function dayBounds(date: string, offset: number): [string, string] {
  const start = localToUtc(date, DAY_STARTS_AT_MINUTES, offset);
  return [start.toISOString(), new Date(start.getTime() + 24 * HOUR).toISOString()];
}

export function shiftDate(date: string, days: number): string {
  return new Date(localToUtc(date, 0, 0).getTime() + days * 24 * HOUR).toISOString().slice(0, 10);
}

export function timeLabel(iso: string, offset: number): string {
  const local = new Date(new Date(iso).getTime() + offset * 60_000);
  const h = local.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(local.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function dateLabel(date: string): string {
  return localToUtc(date, 0, 0).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export const toRules = (r: RulesRow): Rules => ({
  slotMinutes: r.slot_minutes,
  turnMinutesSmall: r.turn_minutes_small,
  turnMinutesLarge: r.turn_minutes_large,
  largePartyFrom: r.large_party_from,
  maxPartyOnline: r.max_party_online,
  maxCoversPerSlot: r.max_covers_per_slot,
  minLeadMinutes: r.min_lead_minutes,
  maxDaysAhead: r.max_days_ahead,
  autoConfirmMaxParty: r.auto_confirm_max_party,
  depositMode: r.deposit_mode,
  depositPerGuestFils: r.deposit_per_guest_fils,
  holdMinutes: r.hold_minutes,
});

/** Staff can book outside the public limits: any party size, no notice period, far ahead. */
export const staffRules = (r: RulesRow): Rules => ({ ...toRules(r), minLeadMinutes: -24 * 60, maxPartyOnline: 100, maxDaysAhead: 365, maxCoversPerSlot: null });

export const toEngineTables = (rows: TableRow[]): Table[] =>
  rows.map((t) => ({ id: t.id, label: t.label, zoneId: t.zone_id, seatsMin: t.seats_min, seatsMax: t.seats_max, isActive: t.is_active }));

export const toExisting = (rows: BookingRow[]): ExistingBooking[] =>
  rows.map((b) => ({
    tableId: b.table_id,
    partySize: b.party_size,
    startsAt: new Date(b.starts_at),
    endsAt: new Date(b.ends_at),
    status: b.status,
    holdExpiresAt: null,
  }));

export const toDayHours = (rows: HoursRow[], weekday: number): DayHours => {
  const h = rows.find((r) => r.weekday === weekday);
  return h ? { opens: h.opens, closes: h.closes, isClosed: h.is_closed } : { opens: "12:00", closes: "02:00", isClosed: true };
};

/** Turns a database error into a sentence staff can act on. */
export function explain(error: { code?: string; message: string }): string {
  if (error.code === "23P01") return "That table is already taken for part of that time. Choose another table or time.";
  if (error.code === "42501") return "Your role does not allow that change.";
  if (error.code === "23505") return "That already exists (duplicate name or number).";
  if (error.code === "23514") return "One of the values is out of range.";
  return error.message;
}
