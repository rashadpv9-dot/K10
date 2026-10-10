"use client";

import { useCallback, useEffect, useState } from "react";
import { BOOKING_SELECT, STATUS_LABEL, dateLabel, dayBounds, explain, serviceDay, timeLabel, type BookingRow, type Ctx, type TableRow } from "@/lib/admin/data";
import { FloorLegend, FloorMap, type TableState } from "./FloorMap";

const SOON_MS = 2 * 3_600_000;

export function Overview({ ctx, goTo }: { ctx: Ctx; goTo: (tab: string) => void }) {
  const { sb, outlet } = ctx;
  const offset = outlet.utc_offset_minutes;
  const [today, setToday] = useState<BookingRow[]>([]);
  const [waiting, setWaiting] = useState<BookingRow[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const date = serviceDay(now, offset);

  const load = useCallback(async () => {
    const [from, to] = dayBounds(date, offset);
    const [day, pending] = await Promise.all([
      sb.from("bookings").select(BOOKING_SELECT).eq("outlet_id", outlet.id).gte("starts_at", from).lt("starts_at", to).order("starts_at"),
      sb.from("bookings").select(BOOKING_SELECT).eq("outlet_id", outlet.id).eq("status", "pending_approval").gte("starts_at", from).order("starts_at"),
    ]);
    if (day.error || pending.error) return setError(explain((day.error ?? pending.error)!));
    setToday(day.data as unknown as BookingRow[]);
    setWaiting(pending.data as unknown as BookingRow[]);
    setError("");
  }, [sb, outlet.id, date, offset]);

  useEffect(() => {
    load();
    const tick = setInterval(() => {
      setNow(new Date());
      load();
    }, 60_000);
    return () => clearInterval(tick);
  }, [load]);

  const decide = async (id: string, status: "confirmed" | "declined") => {
    const { error } = await sb.from("bookings").update({ status }).eq("id", id);
    if (error) setError(explain(error));
    await load();
  };

  const active = today.filter((b) => ["confirmed", "seated", "pending_approval", "pending_payment"].includes(b.status));
  const guests = active.reduce((sum, b) => sum + b.party_size, 0);
  const seated = today.filter((b) => b.status === "seated");
  const upcoming = today.filter((b) => b.status === "confirmed" && new Date(b.ends_at) > now);

  const stateOf = (t: TableRow): TableState => {
    if (!t.is_active) return { tone: "off", note: "Off" };
    const mine = today.filter((b) => b.table_id === t.id && new Date(b.ends_at) > now);
    const sitting = mine.find((b) => b.status === "seated");
    if (sitting) return { tone: "seated", note: `${sitting.party_size} seated` };
    const next = mine.find((b) => ["confirmed", "pending_approval", "pending_payment"].includes(b.status) && new Date(b.starts_at).getTime() - now.getTime() < SOON_MS);
    if (!next) return { tone: "free" };
    return { tone: next.status === "confirmed" ? "booked" : "pending", note: `${timeLabel(next.starts_at, offset)} · ${next.party_size}` };
  };

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Overview</h1>
          <p className="adm-muted">{dateLabel(date)} · {timeLabel(now.toISOString(), offset)} Bahrain time</p>
        </div>
        <button className="adm-btn -primary" onClick={() => goTo("bookings")}>Manage bookings</button>
      </header>
      {error && <p className="adm-error" role="alert">{error}</p>}

      <section className="adm-stats">
        <div className="adm-card adm-stat"><b>{active.length}</b><span>Bookings today</span></div>
        <div className="adm-card adm-stat"><b>{guests}</b><span>Guests expected</span></div>
        <div className="adm-card adm-stat -alert"><b>{waiting.length}</b><span>Need approval</span></div>
        <div className="adm-card adm-stat"><b>{seated.length}</b><span>Tables seated now</span></div>
      </section>

      <div className="adm-cols">
        <section className="adm-card">
          <div className="adm-card__head">
            <h2>Floor right now</h2>
            <FloorLegend />
          </div>
          <FloorMap ctx={ctx} tables={ctx.tables} stateOf={stateOf} />
          <p className="adm-muted adm-small">A table shows as booked from two hours before its next booking.</p>
        </section>

        <div className="adm-stack">
          <section className="adm-card">
            <h2>Group requests to approve</h2>
            {waiting.length === 0 && <p className="adm-muted">Nothing waiting.</p>}
            <ul className="adm-list">
              {waiting.map((b) => (
                <li key={b.id}>
                  <div>
                    <b>{b.customer?.name}</b> · {b.party_size} guests
                    <small>
                      {dateLabel(serviceDay(new Date(b.starts_at), offset))}, {timeLabel(b.starts_at, offset)} · table {b.table?.label ?? "not set"}
                      {b.notes ? ` · ${b.notes}` : ""}
                    </small>
                  </div>
                  <span className="adm-actions">
                    <button className="adm-btn -primary -sm" onClick={() => decide(b.id, "confirmed")}>Approve</button>
                    <button className="adm-btn -sm" onClick={() => decide(b.id, "declined")}>Decline</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="adm-card">
            <h2>Still to arrive today</h2>
            {upcoming.length === 0 && <p className="adm-muted">No more confirmed bookings today.</p>}
            <ul className="adm-list">
              {upcoming.map((b) => (
                <li key={b.id}>
                  <div>
                    <b>{timeLabel(b.starts_at, offset)}</b> · {b.customer?.name} · {b.party_size} guests
                    <small>Table {b.table?.label ?? "not set"}{b.notes ? ` · ${b.notes}` : ""}</small>
                  </div>
                  <span className={`adm-badge -${b.status}`}>{STATUS_LABEL[b.status]}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
