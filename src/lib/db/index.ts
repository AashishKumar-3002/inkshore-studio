import { drizzle as drizzleNode, NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Where this process keeps its data.
 *
 * A desktop install gets its own PGlite database inside the app's data
 * folder — real Postgres compiled to WASM, so the schema, the migrations
 * and every query in the repo layer are identical to the hosted build.
 * Nobody installing the app has to supply a connection string, which was
 * the whole problem with shipping a Postgres client as a product.
 *
 * Anything else — the hosted web app, CI — connects to a Postgres server
 * over DATABASE_URL exactly as before.
 */
export function localDbDir(): string | undefined {
  return process.env.INKSHORE_DB_DIR || process.env.INKDROP_DB_DIR || undefined;
}

export function isLocalDb(): boolean {
  return Boolean(localDbDir());
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at your Postgres instance."
    );
  }
  return new Pool({
    connectionString,
    // Managed Postgres (Neon, Supabase, RDS…) terminates TLS with certs that
    // aren't in the container's trust store; opt in explicitly via env.
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  });
}

/**
 * One pool — or one PGlite handle — per process. Next's dev-mode hot
 * reloading re-evaluates modules on every change, so without this the
 * process leaks a connection per edit. With PGlite it would be worse than a
 * leak: a second handle on the same directory is a locking error.
 */
const globalForDb = globalThis as unknown as {
  __inkshorePool?: Pool;
  __inkshoreDb?: NodePgDatabase<typeof schema>;
  // Read the pre-rebrand globals during hot reload so a running dev process
  // does not open a second connection when this module is replaced.
  __inkdropPool?: Pool;
  __inkdropDb?: NodePgDatabase<typeof schema>;
};

/**
 * Built on first use rather than at import time, so importing a module that
 * touches the database doesn't crash the process when DATABASE_URL is
 * absent (unit tests, `next build`'s static analysis).
 */
export function getPool(): Pool {
  if (isLocalDb()) {
    throw new Error("This install uses a local database; there is no connection pool.");
  }
  globalForDb.__inkshorePool ??= globalForDb.__inkdropPool ?? createPool();
  return globalForDb.__inkshorePool;
}

function build(): NodePgDatabase<typeof schema> {
  const dir = localDbDir();
  if (dir) {
    // PGlite's constructor returns immediately and queues queries until the
    // WASM engine is up, so this stays synchronous. Its drizzle instance
    // speaks the same pg dialect; the cast is over driver plumbing, not the
    // query surface the repo layer uses.
    return drizzlePglite(new PGlite(dir), { schema }) as unknown as NodePgDatabase<
      typeof schema
    >;
  }
  // The proxy defers connecting until a query is actually issued.
  return drizzleNode(
    new Proxy({} as Pool, {
      get(_target, prop, receiver) {
        return Reflect.get(getPool(), prop, receiver);
      },
    }),
    { schema }
  );
}

/**
 * Built at module load, not on first query. Auth.js's Drizzle adapter walks
 * this object's properties while the module graph is being collected, so a
 * proxy that constructed the driver on first property access would try to
 * open a connection during `next build`.
 *
 * That is safe to do eagerly because both branches defer the actual work:
 * the pg branch only creates its pool when a query runs, and PGlite queues
 * queries until its engine is up. Which branch to take is settled by env
 * that the desktop shell sets before this process starts.
 */
export const db: NodePgDatabase<typeof schema> =
  globalForDb.__inkshoreDb ??
  globalForDb.__inkdropDb ??
  (globalForDb.__inkshoreDb = build());

export { schema };
