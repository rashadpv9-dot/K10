"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, explain, type Ctx, type FloorPlan, type HoursRow, type Outlet, type Role, type RulesRow, type TableRow, type Zone } from "@/lib/admin/data";
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

type Me = { email: string; name: string; role: Role };
type Loaded = Omit<Ctx, "reload">;
type OutletResponse = {
  outlet: Outlet;
  role: Role;
  rules: RulesRow;
  hours: HoursRow[];
  zones: Zone[];
  plan: FloorPlan;
  tables: TableRow[];
};

async function loadOutlet(): Promise<Loaded> {
  const d = await api.get<OutletResponse>("/api/admin/outlet");
  return { outlet: d.outlet, role: d.role, canManage: d.role !== "host", rules: d.rules, hours: d.hours, zones: d.zones, plan: d.plan, tables: d.tables };
}

function Login({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const { staff } = await api.post<{ staff: Me }>("/api/auth/login", { email: String(form.get("email")), password: String(form.get("password")) });
      onSignedIn(staff);
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
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
  // undefined = still checking, null = signed out
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  const checkSession = useCallback(async () => {
    try {
      const { staff } = await api.get<{ staff: Me }>("/api/auth/me");
      setMe(staff);
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setMe(null);
        setError("");
      } else {
        setError(explain(err));
      }
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const reload = useCallback(async () => {
    try {
      setData(await loadOutlet());
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setMe(null);
      else setError(explain(err));
    }
  }, []);

  useEffect(() => {
    if (me) reload();
    else setData(null);
  }, [me, reload]);

  const signOut = async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    setMe(null);
  };

  if (me === undefined) {
    return (
      <main className="adm-login">
        {error ? (
          <div className="adm-card adm-login__card">
            <p className="adm-error" role="alert">{error}</p>
            <button className="adm-btn -primary" onClick={() => { setError(""); checkSession(); }}>Try again</button>
          </div>
        ) : (
          <p className="adm-muted">Loading…</p>
        )}
      </main>
    );
  }
  if (!me) return <Login onSignedIn={setMe} />;

  const ctx: Ctx | null = data ? { ...data, reload } : null;

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
          <span title={me.email}>{me.name || me.email}</span>
          <small>{me.role}</small>
          <button className="adm-btn -ghost" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="adm-main">
        {error && (
          <p className="adm-error" role="alert">
            {error}{" "}
            <button className="adm-btn -sm" onClick={reload}>Try again</button>
          </p>
        )}
        {!ctx && !error && <p className="adm-muted">Loading…</p>}
        {ctx && tab === "overview" && <Overview ctx={ctx} goTo={(t) => setTab(t as Tab)} />}
        {ctx && tab === "bookings" && <Bookings ctx={ctx} />}
        {ctx && tab === "layout" && <LayoutEditor ctx={ctx} />}
        {ctx && tab === "settings" && <Settings ctx={ctx} />}
      </main>
    </div>
  );
}
