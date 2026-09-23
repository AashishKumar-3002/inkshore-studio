import { generateNKeysBetween } from "fractional-indexing";

/**
 * Completes the data-dependent portion of migration 0001.
 *
 * Drizzle migrations remain immutable SQL files. This step runs before the
 * migrator reaches 0003, because existing rows need application code to mint
 * valid fractional keys before 0003 can make the column non-null.
 *
 * The query function is intentionally pg-shaped so the hosted Postgres and
 * embedded PGlite runners execute the same data transition.
 */
export async function finaliseSortKeys(query, log = () => {}) {
  const { rows: columns } = await query(
    `select column_name from information_schema.columns
     where table_name = 'chapter' and column_name in ('index', 'sortKey')`
  );
  const names = new Set(columns.map(({ column_name }) => column_name));

  if (!names.has("sortKey") || !names.has("index")) {
    return;
  }

  const { rows: projects } = await query(
    `select distinct "projectId" from "chapter" where "sortKey" is null`
  );
  if (projects.length === 0) {
    return;
  }

  await query("begin");
  try {
    for (const { projectId } of projects) {
      const { rows } = await query(
        `select id from "chapter"
         where "projectId" = $1 and "sortKey" is null
         order by "index" asc, id asc`,
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
    await query("commit");
    log(`chapter ordering finalised (${projects.length} project(s) migrated)`);
  } catch (error) {
    await query("rollback").catch(() => {});
    throw error;
  }
}
