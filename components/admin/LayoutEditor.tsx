"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { explain, type Ctx, type TableRow } from "@/lib/admin/data";
import { FloorMap } from "./FloorMap";

const SHAPES: [TableRow["shape"], string][] = [
  ["round", "Round"],
  ["square", "Square"],
  ["rect", "Long table"],
  ["booth", "Booth"],
  ["bar", "Bar seats"],
];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const imageSize = (file: File) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
      URL.revokeObjectURL(url);
    };
    probe.onerror = () => reject(new Error("That file could not be read as an image."));
    probe.src = url;
  });

export function LayoutEditor({ ctx }: { ctx: Ctx }) {
  const { sb, outlet, plan, zones, canManage, reload } = ctx;
  const [tables, setTables] = useState(ctx.tables);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = tables.find((t) => t.id === selectedId) ?? null;

  useEffect(() => setTables(ctx.tables), [ctx.tables]);

  const run = async (work: () => PromiseLike<{ error: { code?: string; message: string } | null }>, done: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    const { error } = await work();
    setBusy(false);
    if (error) return setError(explain(error));
    setNotice(done);
    await reload();
  };

  // Shows a problem and clears any earlier success message, so the two never sit side by side.
  const fail = (message: string) => {
    setNotice("");
    setError(message);
  };

  const patchLocal = (id: string, patch: Partial<TableRow>) => setTables((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const savePosition = (id: string) => {
    const t = tables.find((row) => row.id === id);
    if (t) run(() => sb.from("tables").update({ x: t.x, y: t.y }).eq("id", id), `${t.label} moved.`);
  };

  const saveTable = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected) return;
    const { label, seats_min, seats_max, shape, zone_id, w, h, rotation, is_active } = selected;
    run(() => sb.from("tables").update({ label: label.trim(), seats_min, seats_max, shape, zone_id, w, h, rotation, is_active }).eq("id", selected.id), `${label} saved.`);
  };

  const addTable = () => {
    const taken = new Set(tables.map((t) => t.label));
    let n = tables.length + 1;
    while (taken.has(`T${n}`)) n += 1;
    run(
      () => sb.from("tables").insert({ outlet_id: outlet.id, floor_plan_id: plan.id, zone_id: zones[0]?.id ?? null, label: `T${n}`, seats_min: 2, seats_max: 4, shape: "square", x: 50, y: 50 }),
      `Table T${n} added in the middle of the floor. Drag it into place.`
    );
  };

  const removeTable = () => {
    if (!selected || !window.confirm(`Remove table ${selected.label}? Its past bookings are kept, without a table.`)) return;
    setSelectedId(null);
    run(() => sb.from("tables").delete().eq("id", selected.id), `${selected.label} removed.`);
  };

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return fail("Use a PNG, JPG or WebP image.");
    if (file.size > MAX_IMAGE_BYTES) return fail("That image is over 5 MB. Export a smaller one.");
    try {
      const { width, height } = await imageSize(file);
      const path = `${outlet.id}/${Date.now()}.${file.type.split("/")[1].replace("jpeg", "jpg")}`;
      await run(async () => {
        const up = await sb.storage.from("floor-plans").upload(path, file, { contentType: file.type });
        if (up.error) return { error: { message: up.error.message } };
        const saved = await sb.from("floor_plans").update({ image_path: path, image_width: width, image_height: height }).eq("id", plan.id);
        if (!saved.error && plan.image_path) await sb.storage.from("floor-plans").remove([plan.image_path]);
        return saved;
      }, "Layout image uploaded. Drag the tables onto it.");
    } catch (err) {
      fail((err as Error).message);
    }
  };

  const removeImage = () => {
    if (!plan.image_path || !window.confirm("Remove the layout image? The tables stay where they are.")) return;
    run(async () => {
      const saved = await sb.from("floor_plans").update({ image_path: null, image_width: null, image_height: null }).eq("id", plan.id);
      if (!saved.error) await sb.storage.from("floor-plans").remove([plan.image_path!]);
      return saved;
    }, "Layout image removed.");
  };

  const addZone = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get("zone")).trim();
    if (!name) return;
    form.reset();
    run(() => sb.from("zones").insert({ outlet_id: outlet.id, name, sort: zones.length + 1 }), `Area "${name}" added.`);
  };

  const seats = tables.filter((t) => t.is_active).reduce((sum, t) => sum + t.seats_max, 0);

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Tables &amp; layout</h1>
          <p className="adm-muted">{tables.filter((t) => t.is_active).length} tables in use · {seats} seats</p>
        </div>
        {canManage && (
          <span className="adm-actions">
            <label className={`adm-btn${busy ? " is-disabled" : ""}`}>
              {plan.image_path ? "Replace layout image" : "Upload layout image"}
              <input type="file" accept={IMAGE_TYPES.join(",")} onChange={upload} hidden disabled={busy} />
            </label>
            {plan.image_path && <button className="adm-btn" onClick={removeImage} disabled={busy}>Remove image</button>}
            <button className="adm-btn -primary" onClick={addTable} disabled={busy}>Add table</button>
          </span>
        )}
      </header>
      {!canManage && <p className="adm-muted">Your role can view the layout. A manager or owner can change it.</p>}
      {error && <p className="adm-error" role="alert">{error}</p>}
      {notice && <p className="adm-ok" role="status">{notice}</p>}

      <div className="adm-cols -editor">
        <section className="adm-card">
          <FloorMap
            ctx={ctx}
            tables={tables}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={canManage ? (id, x, y) => patchLocal(id, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }) : undefined}
            onMoveEnd={savePosition}
          />
          <p className="adm-muted adm-small">{canManage ? "Drag a table to move it. Click one to edit its details." : "Click a table to see its details."}</p>
        </section>

        <div className="adm-stack">
          <section className="adm-card">
            <h2>{selected ? `Table ${selected.label}` : "Table details"}</h2>
            {!selected && <p className="adm-muted">Select a table on the floor.</p>}
            {selected && (
              <form className="adm-form__grid -narrow" onSubmit={saveTable}>
                <fieldset disabled={!canManage || busy}>
                  <label className="adm-field"><span>Name</span>
                    <input value={selected.label} maxLength={12} required onChange={(e) => patchLocal(selected.id, { label: e.target.value })} />
                  </label>
                  <label className="adm-field"><span>Fewest guests</span>
                    <input type="number" min={1} max={selected.seats_max} value={selected.seats_min} required onChange={(e) => patchLocal(selected.id, { seats_min: Number(e.target.value) })} />
                  </label>
                  <label className="adm-field"><span>Most guests (seats)</span>
                    <input type="number" min={selected.seats_min} max={100} value={selected.seats_max} required onChange={(e) => patchLocal(selected.id, { seats_max: Number(e.target.value) })} />
                  </label>
                  <label className="adm-field"><span>Shape</span>
                    <select value={selected.shape} onChange={(e) => patchLocal(selected.id, { shape: e.target.value as TableRow["shape"] })}>
                      {SHAPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="adm-field"><span>Area</span>
                    <select value={selected.zone_id ?? ""} onChange={(e) => patchLocal(selected.id, { zone_id: e.target.value || null })}>
                      <option value="">No area</option>
                      {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </label>
                  <label className="adm-field"><span>Width on plan: {selected.w}%</span>
                    <input type="range" min={3} max={30} step={0.5} value={selected.w} onChange={(e) => patchLocal(selected.id, { w: Number(e.target.value) })} />
                  </label>
                  {selected.shape !== "round" && selected.shape !== "square" && (
                    <label className="adm-field"><span>Depth on plan: {selected.h}%</span>
                      <input type="range" min={3} max={30} step={0.5} value={selected.h} onChange={(e) => patchLocal(selected.id, { h: Number(e.target.value) })} />
                    </label>
                  )}
                  <label className="adm-field"><span>Rotation: {selected.rotation}°</span>
                    <input type="range" min={0} max={175} step={5} value={selected.rotation} onChange={(e) => patchLocal(selected.id, { rotation: Number(e.target.value) })} />
                  </label>
                  <label className="adm-check">
                    <input type="checkbox" checked={selected.is_active} onChange={(e) => patchLocal(selected.id, { is_active: e.target.checked })} />
                    <span>Available for bookings</span>
                  </label>
                  {canManage && (
                    <span className="adm-actions">
                      <button className="adm-btn -primary">Save table</button>
                      <button type="button" className="adm-btn -danger" onClick={removeTable}>Remove</button>
                    </span>
                  )}
                </fieldset>
              </form>
            )}
          </section>

          <section className="adm-card">
            <h2>Areas</h2>
            <ul className="adm-list">
              {zones.map((z) => {
                const count = tables.filter((t) => t.zone_id === z.id).length;
                return (
                  <li key={z.id}>
                    <div><b>{z.name}</b><small>{count} table{count === 1 ? "" : "s"}</small></div>
                    {canManage && count === 0 && (
                      <button className="adm-btn -sm" disabled={busy} onClick={() => run(() => sb.from("zones").delete().eq("id", z.id), `Area "${z.name}" removed.`)}>Remove</button>
                    )}
                  </li>
                );
              })}
            </ul>
            {canManage && (
              <form className="adm-inline" onSubmit={addZone}>
                <input name="zone" placeholder="New area, e.g. Bar" maxLength={40} aria-label="New area name" required />
                <button className="adm-btn" disabled={busy}>Add area</button>
              </form>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
