/**
 * Applies the committed Drizzle migrations for either the hosted Postgres
 * database or a desktop PGlite library.
 *
 * The migration files remain the source of truth. The only JavaScript step is
 * the data-dependent sort-key backfill, which runs before migration 0003 so
 * existing rows satisfy its NOT NULL constraint.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { finaliseSortKeys } from "./lib/finalise-sort-keys.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const [dataDir, folderArg] = process.argv.slice(2);
const migrationsFolder = folderArg ?? path.join(here, "..", "drizzle");
const log = (line) => console.log(`[migrate] ${line}`);

async function baselineIfNeeded(query) {
  const { rows } = await query(
    `select to_regclass('public.project') is not null as present`
  );
  if (!rows[0]?.present) return;

  await query(`create schema if not exists drizzle`);
  await query(
    `create table if not exists drizzle.__drizzle_migrations (
       id serial primary key, hash text not null, created_at bigint)`
  );
  const { rows: ledger } = await query(
    `select count(*)::int as n from drizzle.__drizzle_migrations`
  );
  if (ledger[0].n > 0) return;

  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")
  );
  const first = journal.entries[0];
  const sql = fs.readFileSync(path.join(migrationsFolder, `${first.tag}.sql`), "utf8");
  const hash = crypto.createHash("sha256").update(sql).digest("hex");
  await query(
    `insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)`,
    [hash, first.when]
  );
  log(`existing schema detected — baselined at ${first.tag}`);
}

async function openEmbedded(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(dir);
  return {
    db: drizzle(client),
    migrate,
    query: (sql, params) => client.query(sql, params),
    close: () => client.close(),
  };
}

async function openPostgres() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  return {
    db: drizzle(pool),
    migrate,
    query: (sql, params) => pool.query(sql, params),
    close: () => pool.end(),
  };
}

const target = dataDir ? await openEmbedded(dataDir) : await openPostgres();

try {
  await baselineIfNeeded(target.query);
  await finaliseSortKeys(target.query, log);
  await target.migrate(target.db, { migrationsFolder });
  await finaliseSortKeys(target.query, log);
  log("database is up to date");
} catch (error) {
  console.error(`[migrate] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  await target.close();
}
