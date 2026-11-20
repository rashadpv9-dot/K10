// Applies db/migrations/*.sql in order (each once), and optionally loads the dummy data.
//   DATABASE_URL=... node scripts/migrate.mjs           apply new migrations
//   DATABASE_URL=... node scripts/migrate.mjs --seed    also load db/seed.sql if the database is empty
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// Always verify the database certificate (see lib/server/db.ts).
const strictSsl = (url) => {
  const u = new URL(url);
  const mode = u.searchParams.get("sslmode");
  if (mode && mode !== "disable" && mode !== "verify-full") u.searchParams.set("sslmode", "verify-full");
  return u.toString();
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: strictSsl(url) });
await client.connect();

async function inTransaction(work) {
  await client.query("begin");
  try {
    await work();
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

try {
  await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
  const files = readdirSync(join(root, "db", "migrations")).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (done.has(file)) continue;
    await inTransaction(async () => {
      await client.query(readFileSync(join(root, "db", "migrations", file), "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
    });
    console.log(`applied ${file}`);
  }

  if (process.argv.includes("--seed")) {
    const { rows } = await client.query("select count(*)::int as n from outlets");
    if (rows[0].n > 0) {
      console.log("outlets already exist; dummy data not loaded again");
    } else {
      await inTransaction(() => client.query(readFileSync(join(root, "db", "seed.sql"), "utf8")));
      console.log("loaded dummy data");
    }
  }
  console.log("database is up to date");
} finally {
  await client.end();
}
