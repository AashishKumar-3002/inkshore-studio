import { generateNKeysBetween } from "fractional-indexing";

/**
 * The data half of the chapter-ordering migration.
 *
 * This can't live in a .sql file: fractional keys are base-62 with an
 * encoded head, and the library rejects anything it didn't mint, so the
 * values have to be generated in JS. It runs after the schema migrations
 * rather than as one of them, which is what lets a single command do the
 * whole job instead of asking anyone to interleave psql invocations by hand.
 *
 * Idempotent, and a no-op on a database that never had the old integer
 * column — so a fresh install pays nothing for it.
 *
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: any[] }>} query
 *   Any pg-shaped query function. node-postgres clients and PGlite both fit,
 *   which is how the hosted path and the desktop path share this.
 * @param {(line: string) => void} [log]
 */
export async function finaliseSortKeys(query, log = () => {}) {
  const { rows: cols } = await query(
    `select column_name from information_schema.columns
      where table_name = 'chapter' and column_name in ('index', 'sortKey')`
  );
  const names = cols.map((c) => c.column_name);

  if (!names.includes("sortKey")) {
    throw new Error(
      "The chapter table has no sortKey column — run the schema migrations first."
    );
  }
  if (!names.includes("index")) {
    log("chapter ordering already finalised");
    return { migrated: 0, alreadyDone: true };
  }

  const { rows: projects } = await query(
    `select distinct "projectId" from "chapter" where "sortKey" is null`
  );

  for (const { projectId } of projects) {
    // Ordered by the legacy index so the author's chapter order survives.
    const { rows } = await query(
      `select id from "chapter" where "projectId" = $1 order by "index" asc, id asc`,
      [projectId]
    );
    const keys = generateNKeysBetween(null, null, rows.length);
    for (let i = 0; i < rows.length; i++) {
      await query(`update "chapter" set "sortKey" = $1 where id = $2`, [
        keys[i],
        rows[i].id,
      ]);
    }
    log(`  ${projectId}: ${rows.length} chapters keyed`);
  }

  // Only safe once every row has a key, which is the whole reason this isn't
  // a plain migration file.
  await query(`alter table "chapter" alter column "sortKey" set not null`);
  await query(`alter table "chapter" drop column "index"`);
  log(`chapter ordering finalised (${projects.length} project(s) migrated)`);
  return { migrated: projects.length, alreadyDone: false };
}
