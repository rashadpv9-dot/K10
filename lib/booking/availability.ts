// Booking engine: which times can be booked, and which table a party gets.
// Pure functions with no database or network access, so they are easy to test and are
// used the same way by the public booking flow and the admin panel.

export type BookingStatus =
  | "pending_payment"
  | "pending_approval"
  | "confirmed"
  | "seated"
  | "completed"
  | "cancelled"
  | "declined"
  | "no_show"
  | "expired";

export type DepositMode = "none" | "groups" | "all";

export type Rules = {
  slotMinutes: number;
  turnMinutesSmall: number;
  turnMinutesLarge: number;
  largePartyFrom: number;
  maxPartyOnline: number;
  maxCoversPerSlot: number | null;
  minLeadMinutes: number;
  maxDaysAhead: number;
  autoConfirmMaxParty: number;
  depositMode: DepositMode;
  depositPerGuestFils: number;
  holdMinutes: number;
};

export type DayHours = { opens: string; closes: string; isClosed: boolean };

export type Table = {
  id: string;
  label: string;
  zoneId: string | null;
  seatsMin: number;
  seatsMax: number;
  isActive: boolean;
};

export type ExistingBooking = {
  tableId: string | null;
  partySize: number;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  holdExpiresAt: Date | null;
};

export type SlotReason = "ok" | "too_soon" | "too_far" | "no_table" | "slot_full";

export type Slot = {
  start: Date;
  end: Date;
  /** Local time for display, e.g. "7:30 PM". */
  label: string;
  available: boolean;
  /** The table the engine would assign; null when unavailable. */
  tableId: string | null;
  reason: SlotReason;
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const LIVE: BookingStatus[] = ["pending_payment", "pending_approval", "confirmed", "seated"];

/** Parses "HH:MM" or Postgres "HH:MM:SS" into minutes after midnight. */
export function parseTime(time: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!match) throw new Error(`Invalid time: ${time}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time: ${time}`);
  return hours * 60 + minutes;
}

/** Converts a local calendar date (YYYY-MM-DD) plus minutes-after-midnight to a UTC instant. */
export function localToUtc(date: string, minutesAfterMidnight: number, utcOffsetMinutes: number): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid date: ${date}`);
  const midnightUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(midnightUtc)) throw new Error(`Invalid date: ${date}`);
  return new Date(midnightUtc + (minutesAfterMidnight - utcOffsetMinutes) * MINUTE);
}

/** The outlet's local calendar date (YYYY-MM-DD) at a given instant. */
export function localDate(at: Date, utcOffsetMinutes: number): string {
  return new Date(at.getTime() + utcOffsetMinutes * MINUTE).toISOString().slice(0, 10);
}

/** Weekday (0 = Sunday) of a local calendar date. */
export function weekdayOf(date: string): number {
  return localToUtc(date, 0, 0).getUTCDay();
}

/** Service window for a date. A closing time at or before opening means "next day". */
export function serviceWindow(date: string, hours: DayHours, utcOffsetMinutes: number): { open: Date; close: Date } | null {
  if (hours.isClosed) return null;
  const opens = parseTime(hours.opens);
  let closes = parseTime(hours.closes);
  if (closes <= opens) closes += 24 * 60;
  return { open: localToUtc(date, opens, utcOffsetMinutes), close: localToUtc(date, closes, utcOffsetMinutes) };
}

export function turnMinutes(partySize: number, rules: Rules): number {
  return partySize >= rules.largePartyFrom ? rules.turnMinutesLarge : rules.turnMinutesSmall;
}

/** Whether an existing booking still occupies its table at `now`. */
export function isLive(booking: ExistingBooking, now: Date): boolean {
  if (!LIVE.includes(booking.status)) return false;
  if (booking.status === "pending_payment" && booking.holdExpiresAt && booking.holdExpiresAt <= now) return false;
  return true;
}

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;

function timeLabel(at: Date, utcOffsetMinutes: number): string {
  const local = new Date(at.getTime() + utcOffsetMinutes * MINUTE);
  const h = local.getUTCHours();
  const m = local.getUTCMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * Picks the best free table for a party: it must fit the party, match the zone if one was
 * asked for, and be free for the whole sitting. Smallest suitable table wins, so large
 * tables stay available for large parties.
 */
export function pickTable(args: {
  partySize: number;
  start: Date;
  end: Date;
  zoneId?: string | null;
  tables: Table[];
  bookings: ExistingBooking[];
  now: Date;
}): Table | null {
  const { partySize, start, end, zoneId, tables, bookings, now } = args;
  const busy = new Set(
    bookings.filter((b) => b.tableId && isLive(b, now) && overlaps(start, end, b.startsAt, b.endsAt)).map((b) => b.tableId as string)
  );
  const candidates = tables
    .filter((t) => t.isActive && t.seatsMin <= partySize && partySize <= t.seatsMax)
    .filter((t) => !zoneId || t.zoneId === zoneId)
    .filter((t) => !busy.has(t.id))
    .sort((a, b) => a.seatsMax - b.seatsMax || a.seatsMin - b.seatsMin || a.label.localeCompare(b.label, undefined, { numeric: true }));
  return candidates[0] ?? null;
}

/**
 * Every bookable time for a date and party size, each marked available or not (with why).
 * Returns an empty list when the outlet is closed that day or the party is too large to
 * book online.
 */
export function listSlots(args: {
  date: string;
  partySize: number;
  zoneId?: string | null;
  hours: DayHours;
  closedDates?: string[];
  rules: Rules;
  tables: Table[];
  bookings: ExistingBooking[];
  now: Date;
  utcOffsetMinutes: number;
}): Slot[] {
  const { date, partySize, zoneId, hours, closedDates = [], rules, tables, bookings, now, utcOffsetMinutes } = args;
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > rules.maxPartyOnline) return [];
  if (closedDates.includes(date)) return [];
  const window = serviceWindow(date, hours, utcOffsetMinutes);
  if (!window) return [];

  const turn = turnMinutes(partySize, rules) * MINUTE;
  const earliest = now.getTime() + rules.minLeadMinutes * MINUTE;
  // Bookable through the end of the local day that is maxDaysAhead from today.
  const lastDay = localToUtc(localDate(now, utcOffsetMinutes), 0, utcOffsetMinutes).getTime() + (rules.maxDaysAhead + 1) * DAY;

  const slots: Slot[] = [];
  for (let t = window.open.getTime(); t + turn <= window.close.getTime(); t += rules.slotMinutes * MINUTE) {
    const start = new Date(t);
    const end = new Date(t + turn);
    const base = { start, end, label: timeLabel(start, utcOffsetMinutes) };
    const unavailable = (reason: SlotReason): Slot => ({ ...base, available: false, tableId: null, reason });

    if (t < earliest) {
      slots.push(unavailable("too_soon"));
      continue;
    }
    if (t >= lastDay) {
      slots.push(unavailable("too_far"));
      continue;
    }
    if (rules.maxCoversPerSlot !== null) {
      const arriving = bookings.filter((b) => isLive(b, now) && b.startsAt.getTime() === t).reduce((sum, b) => sum + b.partySize, 0);
      if (arriving + partySize > rules.maxCoversPerSlot) {
        slots.push(unavailable("slot_full"));
        continue;
      }
    }
    const table = pickTable({ partySize, start, end, zoneId, tables, bookings, now });
    slots.push(table ? { ...base, available: true, tableId: table.id, reason: "ok" } : unavailable("no_table"));
  }
  return slots;
}

/** Deposit owed for a party, in fils (1 BHD = 1000 fils). */
export function depositFils(partySize: number, rules: Rules): number {
  if (rules.depositMode === "none" || rules.depositPerGuestFils <= 0) return 0;
  if (rules.depositMode === "groups" && partySize <= rules.autoConfirmMaxParty) return 0;
  return partySize * rules.depositPerGuestFils;
}

/**
 * Status a new online booking starts in.
 * - Larger than the instant-confirm limit: staff approve first (payment link follows approval).
 * - Otherwise, if a deposit is owed: the table is held while the customer pays.
 * - Otherwise: confirmed straight away.
 */
export function initialStatus(partySize: number, rules: Rules): BookingStatus {
  if (partySize > rules.autoConfirmMaxParty) return "pending_approval";
  return depositFils(partySize, rules) > 0 ? "pending_payment" : "confirmed";
}
