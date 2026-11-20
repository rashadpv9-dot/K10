// Vercel runs this instead of `npm run build` (the "vercel-build" script).
// Live (production) deploys apply any new database migrations first, then build.
// Preview and local builds never touch the database: previews share it with the live site.
// Dummy data is never loaded here.
import { spawnSync } from "node:child_process";

function run(command, args, env = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", env: { ...process.env, ...env }, shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.VERCEL_ENV === "production") {
  // The direct (unpooled) connection is the right one for schema changes.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error("No database URL available for migrations; stopping the deploy.");
    process.exit(1);
  }
  console.log("Production deploy: applying database migrations");
  run("node", ["scripts/migrate.mjs"], { DATABASE_URL: url });
} else {
  console.log(`${process.env.VERCEL_ENV ?? "local"} build: database migrations skipped`);
}

run("npx", ["next", "build"]);
