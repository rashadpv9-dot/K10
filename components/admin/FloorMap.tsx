"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Ctx, TableRow } from "@/lib/admin/data";

export type TableState = { tone: "free" | "booked" | "seated" | "pending" | "off"; note?: string };

type Props = {
  ctx: Ctx;
  tables: TableRow[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Per-table status colouring (overview). */
  stateOf?: (table: TableRow) => TableState;
  /** Enables dragging. Called continuously while dragging, with positions in percent. */
  onMove?: (id: string, x: number, y: number) => void;
  onMoveEnd?: (id: string) => void;
};

/** Signed URL for the outlet's uploaded layout image (private storage), or null. */
export function useFloorImage(ctx: Ctx): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const path = ctx.plan.image_path;
  useEffect(() => {
    let live = true;
    if (!path) {
      setUrl(null);
      return;
    }
    ctx.sb.storage
      .from("floor-plans")
      .createSignedUrl(path, 3600)
      .then(({ data }) => live && setUrl(data?.signedUrl ?? null));
    return () => {
      live = false;
    };
  }, [ctx.sb, path]);
  return url;
}

const clamp = (v: number) => Math.min(100, Math.max(0, v));

export function FloorMap({ ctx, tables, selectedId, onSelect, stateOf, onMove, onMoveEnd }: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; moved: boolean } | null>(null);
  const image = useFloorImage(ctx);
  const { image_width: iw, image_height: ih } = ctx.plan;
  const aspect = iw && ih ? `${iw} / ${ih}` : "16 / 10";

  const pointerDown = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    onSelect?.(id);
    if (!onMove) return;
    try {
      // Keeps the drag attached to the table even if the pointer leaves it.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some pointers (assistive tech, synthetic events) cannot be captured; dragging still works inside the table.
    }
    drag.current = { id, moved: false };
  };
  const pointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const box = canvas.current?.getBoundingClientRect();
    if (!d || !box || !onMove) return;
    d.moved = true;
    onMove(d.id, clamp(((e.clientX - box.left) / box.width) * 100), clamp(((e.clientY - box.top) / box.height) * 100));
  };
  const pointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) onMoveEnd?.(d.id);
  };

  return (
    <div
      ref={canvas}
      className={`adm-floor${onMove ? " is-editable" : ""}${image ? " has-image" : ""}`}
      style={{ aspectRatio: aspect, backgroundImage: image ? `url("${image}")` : undefined }}
      onClick={(e) => e.target === e.currentTarget && onSelect?.(null)}
    >
      {!image && <span className="adm-floor__hint">No layout image yet{onMove ? " — upload one, or arrange the tables on this grid" : ""}</span>}
      {tables.map((t) => {
        const state: TableState = stateOf?.(t) ?? { tone: t.is_active ? "free" : "off" };
        const square = t.shape === "round" || t.shape === "square";
        return (
          <button
            key={t.id}
            type="button"
            className={`adm-table -${t.shape} -${state.tone}${selectedId === t.id ? " is-selected" : ""}`}
            style={{
              left: `${t.x}%`,
              top: `${t.y}%`,
              width: `${t.w}%`,
              height: square ? undefined : `${t.h}%`,
              aspectRatio: square ? "1" : undefined,
              transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
            }}
            title={`${t.label} · ${t.seats_min}–${t.seats_max} seats${state.note ? ` · ${state.note}` : ""}`}
            onPointerDown={(e) => pointerDown(e, t.id)}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
          >
            <b>{t.label}</b>
            <small>{state.note ?? `${t.seats_max} seats`}</small>
          </button>
        );
      })}
    </div>
  );
}

export function FloorLegend() {
  return (
    <ul className="adm-legend">
      <li className="-free">Free</li>
      <li className="-booked">Booked</li>
      <li className="-pending">Needs approval</li>
      <li className="-seated">Seated</li>
      <li className="-off">Switched off</li>
    </ul>
  );
}
