// A local Postgres for development without Neon: PGlite behind a normal Postgres port.
//   node scripts/dev-db.mjs   then   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres
// Data is kept in .pglite/ (ignored by git). Accepts one connection at a time, so set DATABASE_POOL_MAX=1.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.DEV_DB_PORT ?? 5433);
const db = await PGlite.create("./.pglite", { extensions: { btree_gist } });
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
await server.start();
console.log(`local database ready on postgres://postgres:postgres@127.0.0.1:${port}/postgres`);

const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
