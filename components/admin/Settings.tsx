"use client";

import { useEffect, useState, type FormEvent } from "react";
import { WEEKDAYS, explain, type Ctx, type HoursRow, type RulesRow } from "@/lib/admin/data";

export function Settings({ ctx }: { ctx: Ctx }) {
  const { sb, outlet, canManage, reload } = ctx;
  const [rules, setRules] = useState<RulesRow>(ctx.rules);
  const [hours, setHours] = useState<HoursRow[]>(ctx.hours);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setRules(ctx.rules), [ctx.rules]);
  useEffect(() => setHours(ctx.hours), [ctx.hours]);

  const set = <K extends keyof RulesRow>(key: K, value: RulesRow[K]) => setRules((r) => ({ ...r, [key]: value }));
  const num = (key: keyof RulesRow) => ({
    type: "number" as const,
    value: rules[key] as number,
    onChange: (e: { target: { value: string } }) => set(key, Number(e.target.value) as never),
    required: true,
  });

  const finish = async (error: { code?: string; message: string } | null, done: string) => {
    setBusy(false);
    if (error) return setError(explain(error));
    setNotice(done);
    await reload();
  };

  const saveRules = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const { outlet_id: _outlet, ...patch } = rules;
    const { error } = await sb.from("booking_rules").update(patch).eq("outlet_id", outlet.id);
    finish(error, "Booking rules saved.");
  };

  const saveHours = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const { error } = await sb.from("opening_hours").upsert(hours.map((h) => ({ ...h, opens: h.opens.slice(0, 5), closes: h.closes.slice(0, 5) })));
    finish(error, "Opening hours saved.");
  };

  const setDay = (weekday: number, patch: Partial<HoursRow>) => setHours((all) => all.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)));

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Settings</h1>
          <p className="adm-muted">How online booking behaves for {outlet.name}.</p>
        </div>
      </header>
      {!canManage && <p className="adm-muted">Your role can view these settings. A manager or owner can change them.</p>}
      {error && <p className="adm-error" role="alert">{error}</p>}
      {notice && <p className="adm-ok" role="status">{notice}</p>}

      <div className="adm-cols">
        <form className="adm-card" onSubmit={saveRules}>
          <h2>Booking rules</h2>
          <fieldset className="adm-form__grid" disabled={!canManage || busy}>
            <label className="adm-field"><span>Time slots every</span>
              <select value={rules.slot_minutes} onChange={(e) => set("slot_minutes", Number(e.target.value))}>
                <option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>60 minutes</option>
              </select>
            </label>
            <label className="adm-field"><span>Confirm instantly up to (guests)</span><input {...num("auto_confirm_max_party")} min={0} max={100} /></label>
            <label className="adm-field"><span>Table held for small parties (minutes)</span><input {...num("turn_minutes_small")} min={30} max={480} step={15} /></label>
            <label className="adm-field"><span>Table held for large parties (minutes)</span><input {...num("turn_minutes_large")} min={30} max={480} step={15} /></label>
            <label className="adm-field"><span>A large party starts at (guests)</span><input {...num("large_party_from")} min={2} max={100} /></label>
            <label className="adm-field"><span>Largest party bookable online</span><input {...num("max_party_online")} min={1} max={100} /></label>
            <label className="adm-field"><span>Shortest notice (minutes)</span><input {...num("min_lead_minutes")} min={0} max={10080} step={15} /></label>
            <label className="adm-field"><span>Book up to (days ahead)</span><input {...num("max_days_ahead")} min={1} max={365} /></label>
            <label className="adm-field"><span>Most guests arriving per slot (blank = no limit)</span>
              <input type="number" min={1} max={1000} value={rules.max_covers_per_slot ?? ""} onChange={(e) => set("max_covers_per_slot", e.target.value ? Number(e.target.value) : null)} />
            </label>
            <label className="adm-field"><span>Deposit</span>
              <select value={rules.deposit_mode} onChange={(e) => set("deposit_mode", e.target.value as RulesRow["deposit_mode"])}>
                <option value="none">No deposit</option><option value="groups">Groups only</option><option value="all">Every booking</option>
              </select>
            </label>
            <label className="adm-field"><span>Deposit per guest (BD)</span>
              <input type="number" min={0} max={500} step={0.5} value={rules.deposit_per_guest_fils / 1000} onChange={(e) => set("deposit_per_guest_fils", Math.round(Number(e.target.value) * 1000))} />
            </label>
            <label className="adm-check -wide">
              <input type="checkbox" checked={rules.allow_table_choice} onChange={(e) => set("allow_table_choice", e.target.checked)} />
              <span>Let customers pick their exact table online</span>
            </label>
          </fieldset>
          <p className="adm-muted adm-small">Deposits are recorded here but not charged yet: online payment is not connected.</p>
          {canManage && <button className="adm-btn -primary" disabled={busy}>Save rules</button>}
        </form>

        <form className="adm-card" onSubmit={saveHours}>
          <h2>Opening hours</h2>
          <fieldset disabled={!canManage || busy}>
            <table className="adm-grid -hours">
              <thead><tr><th>Day</th><th>Opens</th><th>Closes</th><th>Closed</th></tr></thead>
              <tbody>
                {hours.map((h) => (
                  <tr key={h.weekday} className={h.is_closed ? "is-dim" : ""}>
                    <td><b>{WEEKDAYS[h.weekday]}</b></td>
                    <td><input type="time" value={h.opens.slice(0, 5)} disabled={h.is_closed} onChange={(e) => setDay(h.weekday, { opens: e.target.value })} aria-label={`${WEEKDAYS[h.weekday]} opens`} required /></td>
                    <td><input type="time" value={h.closes.slice(0, 5)} disabled={h.is_closed} onChange={(e) => setDay(h.weekday, { closes: e.target.value })} aria-label={`${WEEKDAYS[h.weekday]} closes`} required /></td>
                    <td><input type="checkbox" checked={h.is_closed} onChange={(e) => setDay(h.weekday, { is_closed: e.target.checked })} aria-label={`${WEEKDAYS[h.weekday]} closed`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </fieldset>
          <p className="adm-muted adm-small">A closing time earlier than opening means the next morning (12:00 to 02:00 is noon until 2 AM).</p>
          {canManage && <button className="adm-btn -primary" disabled={busy}>Save hours</button>}
        </form>
      </div>
    </>
  );
}
