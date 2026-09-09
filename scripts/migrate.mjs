/**
 * Brings a database up to date — schema migrations, then the chapter
 * ordering step that has to run in JS.
 *
 * One script for both drivers, on purpose: the desktop app's embedded
 * database and a hosted Postgres run exactly the same sequence, so they
 * can't drift into different shapes.
 *
 * Uses drizzle-orm's migrator rather than the drizzle-kit CLI. drizzle-kit
 * migrate exits 0 without applying anything here, and a migration command
 * that silently does nothing is worse than one that fails.
 *
 *   npm run db:migrate                      # Postgres, from DATABASE_URL
 *   node scripts/migrate.mjs <dir> <folder> # embedded, used by the desktop shell
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import crypto from "node:crypto";
import { finaliseSortKeys } from "./lib/finalise-sort-keys.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const [dataDir, folderArg] = process.argv.slice(2);
const migrationsFolder = folderArg ?? path.join(here, "..", "drizzle");

const log = (line) => console.log(`[migrate] ${line}`);

/**
 * Marks the initial migration as applied on a database whose tables were
 * created before this project tracked migrations at all — otherwise the
 * migrator tries to CREATE TABLE over a live schema and dies.
 *
 * Only fires when the schema is clearly already there and the ledger is
 * completely empty, so it can't mask a genuinely half-applied database.
 */
async function baselineIfNeeded(query) {
  const { rows: existing } = await query(
    `select to_regclass('public.project') is not null as present`
  );
  if (!existing[0]?.present) return;

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
  // Same hash drizzle's own migrator computes: sha256 of the whole file.
  const hash = crypto.createHash("sha256").update(sql).digest("hex");
  await query(
    `insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)`,
    [hash, first.when]
  );
  log(`existing schema detected — baselined at ${first.tag}`);
}

async function withEmbedded(dir) {
  // PGlite creates its own directory but not missing parents, and on a first
  // launch nothing above it necessarily exists yet.
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

async function withPostgres() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  return {
    db: drizzle(pool),
    migrate,
    query: (sql, params) => pool.query(sql, params),
    close: () => pool.end(),
  };
}

const target = dataDir ? await withEmbedded(dataDir) : await withPostgres();

try {
  await baselineIfNeeded(target.query);
  await target.migrate(target.db, { migrationsFolder });
  await finaliseSortKeys(target.query, log);
  log("database is up to date");
} catch (err) {
  console.error(`[migrate] failed: ${err?.message ?? err}`);
  process.exitCode = 1;
} finally {
  await target.close();
}
