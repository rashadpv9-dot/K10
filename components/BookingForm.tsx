"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { listSlots, localDate, turnMinutes, weekdayOf, type ExistingBooking, type Rules, type Table } from "@/lib/booking/availability";
import { site } from "@/lib/site";
import { supabase } from "@/lib/supabase";

const OUTLET = "adliya";
const BAHRAIN_OFFSET = 180;

type Context = {
  outlet: { name: string; utc_offset_minutes: number };
  rules: {
    slot_minutes: number;
    turn_minutes_small: number;
    turn_minutes_large: number;
    large_party_from: number;
    max_party_online: number;
    max_covers_per_slot: number | null;
    min_lead_minutes: number;
    max_days_ahead: number;
    auto_confirm_max_party: number;
    /** Present once the outlet's database supports customers choosing a table. */
    allow_table_choice?: boolean;
  };
  plan?: { width: number | null; height: number | null };
  hours: { opens: string; closes: string; is_closed: boolean } | null;
  closed: boolean;
  zones: { id: string; name: string }[];
  tables: {
    id: string;
    label: string;
    zone_id: string | null;
    seats_min: number;
    seats_max: number;
    // Position on the floor plan, in percent. Only sent when table choice is supported.
    shape?: "round" | "square" | "rect" | "booth" | "bar";
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    rotation?: number;
  }[];
  busy: { table_id: string; starts_at: string; ends_at: string; party_size: number }[];
};

type Result = { reference: string; status: "confirmed" | "pending_approval"; starts_at: string; party_size: number; table?: string };
type Pick = "free" | "taken" | "unfit";

// The database answers with short codes; these are the sentences customers see.
const PROBLEMS: Record<string, string> = {
  no_table: "That time has just been taken. Please choose another time.",
  slot_full: "That time is full. Please choose another time.",
  outside_hours: "That time is not available. Please choose another time.",
  too_soon: "That time is too soon to book online. Please choose a later time or call us.",
  too_far: "That date is too far ahead to book online.",
  party_too_large: "For a group this size, please call us and we will arrange it.",
  invalid_party: "Please choose the number of guests.",
  invalid_name: "Please enter your name.",
  invalid_phone: "Please enter a valid phone number, with the country code if outside Bahrain.",
  invalid_email: "Please check the email address.",
  table_taken: "That table has just been taken. Please pick another table or time.",
  table_unsuitable: "That table does not suit your party size. Please pick another.",
  table_choice_off: "Choosing a table is not available right now. We will pick the best table for you.",
  too_many_bookings: "You already have several upcoming bookings. Please call us to add another.",
  busy: "We are receiving a lot of bookings right now. Please try again in a few minutes or call us.",
};
const FALLBACK = `Online booking is not available right now. Please call us on ${site.phone}.`;

const toRules = (r: Context["rules"]): Rules => ({
  slotMinutes: r.slot_minutes,
  turnMinutesSmall: r.turn_minutes_small,
  turnMinutesLarge: r.turn_minutes_large,
  largePartyFrom: r.large_party_from,
  maxPartyOnline: r.max_party_online,
  maxCoversPerSlot: r.max_covers_per_slot,
  minLeadMinutes: r.min_lead_minutes,
  maxDaysAhead: r.max_days_ahead,
  autoConfirmMaxParty: r.auto_confirm_max_party,
  depositMode: "none",
  depositPerGuestFils: 0,
  holdMinutes: 10,
});

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function whenLabel(iso: string, offset: number): string {
  const local = new Date(new Date(iso).getTime() + offset * 60_000);
  const day = local.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const h = local.getUTCHours();
  return `${day} at ${h % 12 === 0 ? 12 : h % 12}:${String(local.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function BookingForm() {
  // The date is set after mount so the server and the browser never disagree about "today".
  const [date, setDate] = useState("");
  const [today, setToday] = useState("");
  const [party, setParty] = useState(2);
  const [zone, setZone] = useState("");
  const [start, setStart] = useState("");
  const [table, setTable] = useState("");
  const [ctx, setCtx] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const now = localDate(new Date(), BAHRAIN_OFFSET);
    setToday(now);
    setDate(now);
  }, []);

  useEffect(() => {
    if (!date) return;
    let live = true;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase().rpc("booking_context", { p_slug: OUTLET, p_date: date });
        if (!live) return;
        if (error) throw error;
        setCtx(data as Context);
        setError("");
      } catch {
        if (live) setError(FALLBACK);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [date, refresh]);

  const offset = ctx?.outlet.utc_offset_minutes ?? BAHRAIN_OFFSET;
  const maxParty = ctx?.rules.max_party_online ?? 12;

  const free = useMemo(() => {
    if (!ctx || !date || !ctx.hours) return [];
    const tables: Table[] = ctx.tables.map((t) => ({ id: t.id, label: t.label, zoneId: t.zone_id, seatsMin: t.seats_min, seatsMax: t.seats_max, isActive: true }));
    const bookings: ExistingBooking[] = ctx.busy.map((b) => ({
      tableId: b.table_id,
      partySize: b.party_size,
      startsAt: new Date(b.starts_at),
      endsAt: new Date(b.ends_at),
      status: "confirmed",
      holdExpiresAt: null,
    }));
    return listSlots({
      date,
      partySize: party,
      zoneId: zone || null,
      hours: { opens: ctx.hours.opens, closes: ctx.hours.closes, isClosed: ctx.hours.is_closed || weekdayOf(date) < 0 },
      closedDates: ctx.closed ? [date] : [],
      rules: toRules(ctx.rules),
      tables,
      bookings,
      now: new Date(),
      utcOffsetMinutes: offset,
    }).filter((s) => s.available);
  }, [ctx, date, party, zone, offset]);

  const chosen = free.find((s) => s.start.toISOString() === start) ?? free[0];

  // Table picking: shown only when the outlet allows it and the floor positions are available.
  const canPick = Boolean(ctx?.rules.allow_table_choice && chosen && ctx.tables.every((t) => typeof t.x !== "undefined"));
  const pickState = useMemo(() => {
    const states = new Map<string, Pick>();
    if (!ctx || !chosen) return states;
    const from = chosen.start.getTime();
    const to = from + turnMinutes(party, toRules(ctx.rules)) * 60_000;
    for (const t of ctx.tables) {
      const fits = t.seats_min <= party && party <= t.seats_max && (!zone || t.zone_id === zone);
      const taken = ctx.busy.some((b) => b.table_id === t.id && new Date(b.starts_at).getTime() < to && from < new Date(b.ends_at).getTime());
      states.set(t.id, !fits ? "unfit" : taken ? "taken" : "free");
    }
    return states;
  }, [ctx, chosen, party, zone]);
  // A pick only counts while that table is still free for the current time and party.
  const picked = canPick && pickState.get(table) === "free" ? ctx!.tables.find((t) => t.id === table) : undefined;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    // Hidden field real visitors never see; scripts that fill every field are ignored.
    if (form.get("company")) return;
    if (!chosen) return;
    setSending(true);
    setError("");
    try {
      // A chosen table goes through the table-aware function; otherwise the original one.
      const { data, error } = await supabase().rpc(picked ? "create_table_booking" : "create_booking", {
        p_slug: OUTLET,
        p_name: String(form.get("name") ?? ""),
        p_phone: String(form.get("phone") ?? ""),
        p_email: String(form.get("email") ?? ""),
        p_party: party,
        p_starts_at: chosen.start.toISOString(),
        p_zone: zone || null,
        p_notes: String(form.get("notes") ?? ""),
        p_marketing: false,
        // Only sent when the customer chose a table, so older databases keep working.
        ...(picked ? { p_table: picked.id } : {}),
      });
      if (error) {
        setError(PROBLEMS[error.message] ?? FALLBACK);
        // Someone may have taken the slot; show the current free times.
        setRefresh((n) => n + 1);
      } else {
        setResult(data as Result);
      }
    } catch {
      setError(FALLBACK);
    } finally {
      setSending(false);
    }
  };

  if (result) {
    const confirmed = result.status === "confirmed";
    return (
      <div className="booked" role="status">
        <p className="eyebrow">{confirmed ? "Booking confirmed" : "Request received"}</p>
        <h3 className="display h-md">{confirmed ? "You're booked." : "We'll confirm shortly."}</h3>
        <dl>
          <div><dt>When</dt><dd>{whenLabel(result.starts_at, offset)}</dd></div>
          <div><dt>Guests</dt><dd>{result.party_size}</dd></div>
          {result.table && <div><dt>Table</dt><dd>{result.table}</dd></div>}
          <div><dt>Reference</dt><dd>{result.reference}</dd></div>
        </dl>
        <p>
          {confirmed
            ? "Your table is reserved. Quote your reference if you need to change anything."
            : "Group bookings are confirmed by our team. Your table is held, and we will call you to confirm."}
        </p>
        <div className="hero__actions">
          <a className="btn -solid" href={site.phoneHref}>Call {site.phone}</a>
          <button
            className="btn -ghost"
            type="button"
            onClick={() => {
              setResult(null);
              setStart("");
              setTable("");
              setRefresh((n) => n + 1);
            }}
          >
            Book another table
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="r-date">Date</label>
        <input id="r-date" type="date" value={date} min={today} max={today ? addDays(today, ctx?.rules.max_days_ahead ?? 30) : undefined} onChange={(e) => e.target.value && setDate(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="r-guests">Guests</label>
        <select id="r-guests" value={party} onChange={(e) => setParty(Number(e.target.value))}>
          {Array.from({ length: maxParty }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="r-zone">Area</label>
        <select id="r-zone" value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value="">No preference</option>
          {ctx?.zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="r-time">Time</label>
        <select id="r-time" value={chosen?.start.toISOString() ?? ""} onChange={(e) => setStart(e.target.value)} disabled={!free.length} required>
          {!free.length && <option value="">{loading ? "Checking…" : "No times free"}</option>}
          {free.map((s) => (
            <option key={s.start.toISOString()} value={s.start.toISOString()}>{s.label}</option>
          ))}
        </select>
      </div>
      {!loading && !free.length && !error && (
        <p className="form__note" role="status">Nothing is free for {party} {party === 1 ? "guest" : "guests"} on this day. Try another date, or call us on {site.phone}.</p>
      )}
      {ctx && party > ctx.rules.auto_confirm_max_party && free.length > 0 && (
        <p className="form__note">Groups of {ctx.rules.auto_confirm_max_party + 1} or more are confirmed by our team after you send the request.</p>
      )}
      {canPick && ctx && (
        <div className="pick">
          <p className="pick__title" id="pick-title">
            Choose your table <span>(optional)</span>
          </p>
          <div
            className="pick__floor"
            role="group"
            aria-labelledby="pick-title"
            style={{ aspectRatio: ctx.plan?.width && ctx.plan.height ? `${ctx.plan.width} / ${ctx.plan.height}` : "16 / 10" }}
          >
            {ctx.tables.map((t) => {
              const state = pickState.get(t.id) ?? "unfit";
              const square = t.shape === "round" || t.shape === "square";
              const isPicked = picked?.id === t.id;
              const why = state === "taken" ? "taken at this time" : state === "unfit" ? "not suitable for your party" : isPicked ? "selected" : "free";
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`pick__table -${t.shape} -${state}${isPicked ? " is-picked" : ""}`}
                  style={{
                    left: `${t.x}%`,
                    top: `${t.y}%`,
                    width: `${t.w}%`,
                    height: square ? undefined : `${t.h}%`,
                    aspectRatio: square ? "1" : undefined,
                    transform: `translate(-50%, -50%) rotate(${t.rotation ?? 0}deg)`,
                  }}
                  disabled={state !== "free"}
                  aria-pressed={isPicked}
                  aria-label={`Table ${t.label}, seats ${t.seats_max}, ${why}`}
                  onClick={() => setTable(isPicked ? "" : t.id)}
                >
                  <b>{t.label}</b>
                  <small>{t.seats_max}</small>
                </button>
              );
            })}
          </div>
          <ul className="pick__legend">
            <li className="-free">Free</li>
            <li className="-picked">Your table</li>
            <li className="-taken">Taken</li>
            <li className="-unfit">Wrong size or area</li>
          </ul>
          <p className="form__note" role="status">
            {picked
              ? `Table ${picked.label} selected (seats up to ${picked.seats_max}). Tap it again to let us choose.`
              : "Tap a free table to choose it, or leave it and we will pick the best one for you."}
          </p>
        </div>
      )}
      <div className="field">
        <label htmlFor="r-name">Name</label>
        <input id="r-name" name="name" autoComplete="name" minLength={2} maxLength={120} required />
      </div>
      <div className="field">
        <label htmlFor="r-phone">Phone</label>
        <input id="r-phone" name="phone" type="tel" autoComplete="tel" minLength={6} maxLength={24} required />
      </div>
      <div className="field -full">
        <label htmlFor="r-email">Email (optional)</label>
        <input id="r-email" name="email" type="email" autoComplete="email" maxLength={254} />
      </div>
      <div className="field -full">
        <label htmlFor="r-notes">Anything we should know?</label>
        <textarea id="r-notes" name="notes" rows={2} maxLength={1000} data-lenis-prevent></textarea>
      </div>
      <div className="field -trap" aria-hidden="true">
        <label htmlFor="r-company">Company</label>
        <input id="r-company" name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="check -full">
        <input type="checkbox" name="consent" required />
        <span>I agree to Kingston 10 storing these details to manage my booking.</span>
      </label>
      {error && <p className="form__error" role="alert">{error}</p>}
      <button className="btn -solid" type="submit" disabled={sending || !chosen}>{sending ? "Booking…" : party > (ctx?.rules.auto_confirm_max_party ?? 4) ? "Request a table" : "Book a table"}</button>
      <a className="btn -ghost" href={site.phoneHref}>Or call us</a>
    </form>
  );
}
