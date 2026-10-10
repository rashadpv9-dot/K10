"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { listSlots, pickTable, turnMinutes, weekdayOf, type BookingStatus } from "@/lib/booking/availability";
import {
  BOOKING_SELECT,
  LIVE_STATUSES,
  SOURCE_LABEL,
  STATUS_LABEL,
  dateLabel,
  dayBounds,
  explain,
  serviceDay,
  shiftDate,
  staffRules,
  timeLabel,
  toDayHours,
  toEngineTables,
  toExisting,
  type BookingRow,
  type Ctx,
} from "@/lib/admin/data";

const FILTERS: [string, string, (b: BookingRow) => boolean][] = [
  ["all", "All", () => true],
  ["live", "Active", (b) => LIVE_STATUSES.includes(b.status)],
  ["pending_approval", "Needs approval", (b) => b.status === "pending_approval"],
  ["done", "Finished", (b) => ["completed", "cancelled", "declined", "no_show", "expired"].includes(b.status)],
];

// What staff can do next from each status.
const NEXT: Partial<Record<BookingStatus, [BookingStatus, string, boolean?][]>> = {
  pending_approval: [["confirmed", "Approve", true], ["declined", "Decline"]],
  pending_payment: [["confirmed", "Mark paid", true], ["cancelled", "Cancel"]],
  confirmed: [["seated", "Seat", true], ["no_show", "No-show"], ["cancelled", "Cancel"]],
  seated: [["completed", "Complete", true]],
};

export function Bookings({ ctx }: { ctx: Ctx }) {
  const { sb, outlet, tables } = ctx;
  const offset = outlet.utc_offset_minutes;
  const [date, setDate] = useState(() => serviceDay(new Date(), offset));
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const [from, to] = dayBounds(date, offset);
    const { data, error } = await sb.from("bookings").select(BOOKING_SELECT).eq("outlet_id", outlet.id).gte("starts_at", from).lt("starts_at", to).order("starts_at");
    if (error) return setError(explain(error));
    setRows(data as unknown as BookingRow[]);
  }, [sb, outlet.id, date, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (id: string, patch: Record<string, unknown>, done: string) => {
    setError("");
    setNotice("");
    const { error } = await sb.from("bookings").update(patch).eq("id", id);
    if (error) setError(explain(error));
    else setNotice(done);
    await load();
  };

  const shown = rows.filter(FILTERS.find((f) => f[0] === filter)![2]);

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Bookings</h1>
          <p className="adm-muted">{dateLabel(date)} · {rows.filter((b) => LIVE_STATUSES.includes(b.status)).length} active</p>
        </div>
        <button className="adm-btn -primary" onClick={() => setAdding((v) => !v)}>{adding ? "Close" : "New booking"}</button>
      </header>

      {adding && (
        <NewBooking
          ctx={ctx}
          defaultDate={date}
          onSaved={(savedDate, message) => {
            setAdding(false);
            setError("");
            setNotice(message);
            if (savedDate === date) load();
            else setDate(savedDate);
          }}
        />
      )}

      <div className="adm-toolbar">
        <div className="adm-datenav">
          <button className="adm-btn -sm" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">←</button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
          <button className="adm-btn -sm" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">→</button>
          <button className="adm-btn -sm" onClick={() => setDate(serviceDay(new Date(), offset))}>Today</button>
        </div>
        <div className="adm-chips" role="tablist" aria-label="Filter">
          {FILTERS.map(([id, label, test]) => (
            <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? "is-active" : ""} onClick={() => setFilter(id)}>
              {label} <span>{rows.filter(test).length}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="adm-error" role="alert">{error}</p>}
      {notice && <p className="adm-ok" role="status">{notice}</p>}

      <div className="adm-card adm-tablewrap">
        <table className="adm-grid">
          <thead>
            <tr>
              <th>Time</th>
              <th>Guest</th>
              <th>Guests</th>
              <th>Table</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="adm-muted">No bookings for this day{filter !== "all" ? " in this filter" : ""}.</td>
              </tr>
            )}
            {shown.map((b) => {
              const live = LIVE_STATUSES.includes(b.status);
              return (
                <tr key={b.id} className={live ? "" : "is-dim"}>
                  <td>
                    <b>{timeLabel(b.starts_at, offset)}</b>
                    <small>until {timeLabel(b.ends_at, offset)}</small>
                  </td>
                  <td>
                    <b>{b.customer?.name}</b>
                    <small>{b.customer?.phone} · {SOURCE_LABEL[b.source]} · #{b.reference}</small>
                  </td>
                  <td>{b.party_size}</td>
                  <td>
                    {live ? (
                      <select
                        value={b.table_id ?? ""}
                        aria-label={`Table for ${b.customer?.name}`}
                        onChange={(e) => update(b.id, { table_id: e.target.value || null }, "Table changed.")}
                      >
                        <option value="">Not set</option>
                        {tables.filter((t) => t.is_active || t.id === b.table_id).map((t) => (
                          <option key={t.id} value={t.id}>{t.label} ({t.seats_max})</option>
                        ))}
                      </select>
                    ) : (
                      b.table?.label ?? "—"
                    )}
                  </td>
                  <td><span className={`adm-badge -${b.status}`}>{STATUS_LABEL[b.status]}</span></td>
                  <td className="adm-notes">{b.notes ?? ""}{b.is_sample && <em> sample</em>}</td>
                  <td>
                    <span className="adm-actions">
                      {(NEXT[b.status] ?? []).map(([status, label, primary]) => (
                        <button key={status} className={`adm-btn -sm${primary ? " -primary" : ""}`} onClick={() => update(b.id, { status }, `${b.customer?.name}: ${STATUS_LABEL[status].toLowerCase()}.`)}>
                          {label}
                        </button>
                      ))}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function NewBooking({ ctx, defaultDate, onSaved }: { ctx: Ctx; defaultDate: string; onSaved: (date: string, message: string) => void }) {
  const { sb, outlet, rules, hours, zones, tables } = ctx;
  const offset = outlet.utc_offset_minutes;
  const [date, setDate] = useState(defaultDate);
  const [party, setParty] = useState(2);
  const [zone, setZone] = useState("");
  const [start, setStart] = useState("");
  const [dayRows, setDayRows] = useState<BookingRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const [from, to] = dayBounds(shiftDate(date, -1), offset);
    const until = new Date(new Date(to).getTime() + 24 * 3_600_000).toISOString();
    sb.from("bookings").select(BOOKING_SELECT).eq("outlet_id", outlet.id).gte("starts_at", from).lt("starts_at", until)
      .then(({ data }) => live && setDayRows((data ?? []) as unknown as BookingRow[]));
    return () => {
      live = false;
    };
  }, [sb, outlet.id, date, offset]);

  const engine = useMemo(() => ({ rules: staffRules(rules), tables: toEngineTables(tables), bookings: toExisting(dayRows) }), [rules, tables, dayRows]);
  const slots = useMemo(
    () => listSlots({ date, partySize: party, zoneId: zone || null, hours: toDayHours(hours, weekdayOf(date)), ...engine, now: new Date(), utcOffsetMinutes: offset }),
    [date, party, zone, hours, engine, offset]
  );
  const free = slots.filter((s) => s.available && s.start.getTime() > Date.now() - 30 * 60_000);
  const chosen = free.find((s) => s.start.toISOString() === start) ?? free[0];

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!chosen) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");

    const customer = await sb
      .from("customers")
      .upsert({ outlet_id: outlet.id, name: String(form.get("name")).trim(), phone: String(form.get("phone")).trim(), email: String(form.get("email") || "").trim() || null }, { onConflict: "outlet_id,phone" })
      .select("id")
      .single();
    if (customer.error) {
      setBusy(false);
      return setError(explain(customer.error));
    }

    const end = new Date(chosen.start.getTime() + turnMinutes(party, engine.rules) * 60_000);
    // Re-pick at submit time; the database constraint is the final guard against a clash.
    const table = pickTable({ partySize: party, start: chosen.start, end, zoneId: zone || null, tables: engine.tables, bookings: engine.bookings, now: new Date() });
    const { error } = await sb.from("bookings").insert({
      outlet_id: outlet.id,
      customer_id: customer.data.id,
      table_id: table?.id ?? chosen.tableId,
      zone_id: zone || null,
      party_size: party,
      starts_at: chosen.start.toISOString(),
      ends_at: end.toISOString(),
      status: "confirmed",
      source: String(form.get("source")),
      notes: String(form.get("notes") || "").trim() || null,
    });
    setBusy(false);
    if (error) return setError(explain(error));
    onSaved(serviceDay(chosen.start, offset), `Booked ${form.get("name")} for ${chosen.label}.`);
  };

  return (
    <form className="adm-card adm-form" onSubmit={submit}>
      <h2>New booking</h2>
      <div className="adm-form__grid">
        <label className="adm-field"><span>Guest name</span><input name="name" required maxLength={120} /></label>
        <label className="adm-field"><span>Phone</span><input name="phone" type="tel" required minLength={5} maxLength={24} /></label>
        <label className="adm-field"><span>Email (optional)</span><input name="email" type="email" maxLength={254} /></label>
        <label className="adm-field"><span>Came in by</span>
          <select name="source" defaultValue="phone"><option value="phone">Phone</option><option value="walk_in">Walk-in</option></select>
        </label>
        <label className="adm-field"><span>Date</span><input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} required /></label>
        <label className="adm-field"><span>Guests</span><input type="number" min={1} max={100} value={party} onChange={(e) => setParty(Math.max(1, Number(e.target.value) || 1))} required /></label>
        <label className="adm-field"><span>Area</span>
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">Any area</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </label>
        <label className="adm-field"><span>Time ({free.length} free)</span>
          <select value={chosen?.start.toISOString() ?? ""} onChange={(e) => setStart(e.target.value)} required disabled={!free.length}>
            {!free.length && <option value="">No free tables</option>}
            {free.map((s) => (
              <option key={s.start.toISOString()} value={s.start.toISOString()}>
                {s.label} · table {tables.find((t) => t.id === s.tableId)?.label}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-field -wide"><span>Notes</span><input name="notes" maxLength={1000} placeholder="Occasion, allergies, seating requests" /></label>
      </div>
      {slots.length === 0 && <p className="adm-muted">Closed on this day, or no table fits that many guests.</p>}
      {error && <p className="adm-error" role="alert">{error}</p>}
      <button className="adm-btn -primary" disabled={busy || !chosen}>{busy ? "Saving…" : "Save booking"}</button>
    </form>
  );
}
