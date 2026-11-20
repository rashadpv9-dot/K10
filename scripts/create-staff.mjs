// Creates a staff login (or resets its password) with a random password, and writes the
// details to a local file instead of the screen, so they never end up in logs or chat.
//   DATABASE_URL=... node scripts/create-staff.mjs --email demo@kingston10.example --name "Demo Owner" --role owner [--out demo-login.txt]
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import pg from "pg";

// Always verify the database certificate (see lib/server/db.ts).
const strictSsl = (url) => {
  const u = new URL(url);
  const mode = u.searchParams.get("sslmode");
  if (mode && mode !== "disable" && mode !== "verify-full") u.searchParams.set("sslmode", "verify-full");
  return u.toString();
};

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const email = (arg("email") ?? "").trim().toLowerCase();
const name = arg("name", "Staff");
const role = arg("role", "host");
const outlet = arg("outlet", "adliya");
const out = arg("out", "demo-login.txt");
const site = arg("site", "https://kingston-10.vercel.app");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Give a valid --email.");
if (!["owner", "manager", "host"].includes(role)) throw new Error("--role must be owner, manager or host.");

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const password = Array.from(randomBytes(18), (b) => alphabet[b % alphabet.length]).join("");
const hash = await bcrypt.hash(password, 12);

const client = new pg.Client({ connectionString: strictSsl(process.env.DATABASE_URL) });
await client.connect();
try {
  await client.query("begin");
  const o = await client.query("select id from outlets where slug = $1", [outlet]);
  if (!o.rows[0]) throw new Error(`No outlet "${outlet}". Run the migrations with --seed first.`);
  const u = await client.query(
    `insert into staff_users (email, name, password_hash) values ($1, $2, $3)
     on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash, is_disabled = false
     returning id`,
    [email, name, hash]
  );
  await client.query(
    `insert into staff (user_id, outlet_id, role) values ($1, $2, $3)
     on conflict (user_id, outlet_id) do update set role = excluded.role`,
    [u.rows[0].id, o.rows[0].id, role]
  );
  // A new password signs out any old sessions for this login.
  await client.query("delete from sessions where user_id = $1", [u.rows[0].id]);
  await client.query("commit");
} catch (err) {
  await client.query("rollback");
  throw err;
} finally {
  await client.end();
}

writeFileSync(
  out,
  [
    `Kingston 10 admin - ${role.toUpperCase()} LOGIN`,
    "",
    `Open:     ${site}/admin`,
    `Email:    ${email}`,
    `Password: ${password}`,
    "",
    "Keep this file private. It is ignored by git on purpose.",
    role === "owner" ? "This login has full control. Replace demo logins with real staff accounts before going live." : "",
    "",
  ].join("\n")
);
console.log(`${role} login for ${email} saved to ${out}`);
