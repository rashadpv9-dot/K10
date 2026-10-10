"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { supabase, type Ctx, type FloorPlan, type HoursRow, type Outlet, type Role, type RulesRow, type TableRow, type Zone } from "@/lib/admin/data";
import { LOGO } from "@/lib/site";
import { Bookings } from "./Bookings";
import { LayoutEditor } from "./LayoutEditor";
import { Overview } from "./Overview";
import { Settings } from "./Settings";

const TABS = [
  ["overview", "Overview"],
  ["bookings", "Bookings"],
  ["layout", "Tables & layout"],
  ["settings", "Settings"],
] as const;
type Tab = (typeof TABS)[number][0];

type Loaded = Omit<Ctx, "reload" | "sb">;

async function loadOutlet(sb: SupabaseClient, userId: string): Promise<Loaded> {
  const staff = await sb.from("staff").select("role, outlet:outlets(id, name, slug, utc_offset_minutes, currency)").eq("user_id", userId).limit(1);
  if (staff.error) throw new Error(staff.error.message);
  const row = staff.data[0] as unknown as { role: Role; outlet: Outlet } | undefined;
  if (!row?.outlet) throw new Error("This account is not set up as staff at any outlet.");
  const outlet = row.outlet;

  const [rules, hours, zones, plan] = await Promise.all([
    sb.from("booking_rules").select("*").eq("outlet_id", outlet.id).single(),
    sb.from("opening_hours").select("*").eq("outlet_id", outlet.id).order("weekday"),
    sb.from("zones").select("id, name, sort").eq("outlet_id", outlet.id).order("sort"),
    sb.from("floor_plans").select("id, name, image_path, image_width, image_height").eq("outlet_id", outlet.id).eq("is_active", true).single(),
  ]);
  const failed = [rules, hours, zones, plan].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const tables = await sb.from("tables").select("*").eq("floor_plan_id", (plan.data as FloorPlan).id).order("label");
  if (tables.error) throw new Error(tables.error.message);

  return {
    outlet,
    role: row.role,
    canManage: row.role !== "host",
    rules: rules.data as RulesRow,
    hours: hours.data as HoursRow[],
    zones: zones.data as Zone[],
    plan: plan.data as FloorPlan,
    // numeric columns arrive as numbers or strings depending on the driver; normalise.
    tables: (tables.data as TableRow[]).map((t) => ({ ...t, x: Number(t.x), y: Number(t.y), w: Number(t.w), h: Number(t.h), rotation: Number(t.rotation) })),
  };
}

function Login({ sb }: { sb: SupabaseClient }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const { error } = await sb.auth.signInWithPassword({ email: String(form.get("email")), password: String(form.get("password")) });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
  };

  return (
    <main className="adm-login">
      <form className="adm-card adm-login__card" onSubmit={submit}>
        <img src={LOGO} alt="Kingston 10" width={72} height={72} />
        <h1>Staff sign in</h1>
        <p className="adm-muted">Bookings, tables and settings for Kingston 10.</p>
        <label className="adm-field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label className="adm-field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <p className="adm-error" role="alert">{error}</p>}
        <button className="adm-btn -primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <a className="adm-link" href="/">← Back to the website</a>
      </form>
    </main>
  );
}

export function AdminApp() {
  const [sb, configError] = useMemo<[SupabaseClient | null, string]>(() => {
    try {
      return [supabase(), ""];
    } catch (e) {
      return [null, (e as Error).message];
    }
  }, []);
  // undefined = still checking, null = signed out
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const userId = session?.user.id;

  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  const reload = useCallback(async () => {
    if (!sb || !userId) return;
    try {
      setData(await loadOutlet(sb, userId));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sb, userId]);

  useEffect(() => {
    if (userId) reload();
    else setData(null);
  }, [userId, reload]);

  if (!sb) return <main className="adm-login"><p className="adm-error">{configError}</p></main>;
  if (session === undefined) return <main className="adm-login"><p className="adm-muted">Loading…</p></main>;
  if (!session) return <Login sb={sb} />;

  const ctx: Ctx | null = data ? { ...data, sb, reload } : null;

  return (
    <div className="adm">
      <aside className="adm-side">
        <a className="adm-brand" href="/admin">
          <img src={LOGO} alt="" width={44} height={44} />
          <span>
            <b>Kingston 10</b>
            <small>{ctx?.outlet.name.split("—")[1]?.trim() ?? "Admin"}</small>
          </span>
        </a>
        <nav className="adm-nav" aria-label="Admin">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? "is-active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="adm-user">
          <span title={session.user.email}>{session.user.email}</span>
          <small>{ctx ? ctx.role : ""}</small>
          <button className="adm-btn -ghost" onClick={() => sb.auth.signOut()}>Sign out</button>
        </div>
      </aside>
      <main className="adm-main">
        {error && <p className="adm-error" role="alert">{error}</p>}
        {!ctx && !error && <p className="adm-muted">Loading…</p>}
        {ctx && tab === "overview" && <Overview ctx={ctx} goTo={(t) => setTab(t as Tab)} />}
        {ctx && tab === "bookings" && <Bookings ctx={ctx} />}
        {ctx && tab === "layout" && <LayoutEditor ctx={ctx} />}
        {ctx && tab === "settings" && <Settings ctx={ctx} />}
      </main>
    </div>
  );
}
