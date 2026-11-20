// Staff sign-in: bcrypt password hashes, random session tokens in HttpOnly cookies, and a
// lockout after repeated wrong passwords. Only a SHA-256 hash of each token is stored.
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { HttpError } from "./http";

export type Role = "owner" | "manager" | "host";
export type Staff = { userId: string; email: string; name: string; role: Role; outletId: string };

export const SESSION_COOKIE = "k10_session";
const SESSION_DAYS = 7;
const LOCK_AFTER_FAILURES = 8;
const LOCK_WINDOW_MINUTES = 15;
const RANK: Record<Role, number> = { host: 1, manager: 2, owner: 3 };

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const bcryptCost = () => Number(process.env.BCRYPT_COST ?? 12);
// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
let dummyHash: string | null = null;

export const hashPassword = (password: string) => bcrypt.hash(password, bcryptCost());

export async function signIn(emailInput: string, password: string): Promise<{ token: string; staff: Staff }> {
  const email = emailInput.trim().toLowerCase();
  const q = db();

  const recent = await q.query<{ n: string }>(
    `select count(*)::text as n from login_attempts
     where email = $1 and not succeeded and at > now() - make_interval(mins => $2)`,
    [email, LOCK_WINDOW_MINUTES]
  );
  if (Number(recent.rows[0]?.n ?? 0) >= LOCK_AFTER_FAILURES) throw new HttpError(429, "locked");

  const found = await q.query<{ id: string; password_hash: string; is_disabled: boolean }>(
    "select id, password_hash, is_disabled from staff_users where email = $1",
    [email]
  );
  const user = found.rows[0];
  dummyHash ??= await bcrypt.hash("not-a-real-password", bcryptCost());
  const ok = await bcrypt.compare(password, user?.password_hash ?? dummyHash);

  await q.query("insert into login_attempts (email, succeeded) values ($1, $2)", [email, Boolean(ok && user && !user.is_disabled)]);
  if (!ok || !user || user.is_disabled) throw new HttpError(401, "wrong_credentials");

  const token = randomBytes(32).toString("base64url");
  await q.query(
    `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), user.id, SESSION_DAYS]
  );
  // Housekeeping: drop this user's expired sessions.
  await q.query("delete from sessions where user_id = $1 and expires_at < now()", [user.id]);

  const staff = await staffForToken(token);
  if (!staff) throw new HttpError(403, "not_staff");
  return { token, staff };
}

export async function signOut(req: Request) {
  const token = readToken(req);
  if (token) await db().query("delete from sessions where token_hash = $1", [sha256(token)]);
}

function readToken(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function staffForToken(token: string): Promise<Staff | null> {
  const res = await db().query<{ user_id: string; email: string; name: string; role: Role; outlet_id: string }>(
    `select u.id as user_id, u.email, u.name, s.role, s.outlet_id
     from sessions x
     join staff_users u on u.id = x.user_id and not u.is_disabled
     join staff s on s.user_id = u.id
     where x.token_hash = $1 and x.expires_at > now()
     order by s.created_at
     limit 1`,
    [sha256(token)]
  );
  const r = res.rows[0];
  return r ? { userId: r.user_id, email: r.email, name: r.name, role: r.role, outletId: r.outlet_id } : null;
}

export async function currentStaff(req: Request): Promise<Staff | null> {
  const token = readToken(req);
  return token ? staffForToken(token) : null;
}

/** The signed-in staff member, if their role is at least `min`; otherwise 401 or 403. */
export async function requireStaff(req: Request, min: Role = "host"): Promise<Staff> {
  const staff = await currentStaff(req);
  if (!staff) throw new HttpError(401, "not_signed_in");
  if (RANK[staff.role] < RANK[min]) throw new HttpError(403, "role_not_allowed");
  return staff;
}

const secure = () => process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

export const sessionCookie = (token: string) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure() ? "; Secure" : ""}`;

export const clearedCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure() ? "; Secure" : ""}`;

/** Records who changed what. Never blocks the change itself. */
export async function audit(staff: Staff, action: string, entity: string, entityId: string | null, detail?: unknown) {
  try {
    await db().query("insert into audit_log (outlet_id, actor, action, entity, entity_id, detail) values ($1, $2, $3, $4, $5, $6)", [
      staff.outletId,
      staff.userId,
      action,
      entity,
      entityId,
      detail === undefined ? null : JSON.stringify(detail),
    ]);
  } catch (err) {
    console.error("audit log write failed", err);
  }
}
