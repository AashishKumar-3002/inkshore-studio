-- Sync-ready chapters: fractional ordering keys and tombstones.
--
-- Every statement is written to be safely re-runnable, so a database that
-- had part of this applied by hand can still be brought forward by
-- `npm run db:migrate`.
--
-- Structure only. "sortKey" lands nullable because its values can't be
-- computed in SQL — fractional keys are base-62 with an encoded head, and
-- the library rejects anything it didn't mint. Run `npm run db:backfill-sort-keys`
-- after this migration to fill them in and drop the legacy "index" column.
-- On a fresh database there are no rows, so the backfill is a no-op.

ALTER TABLE "chapter" ADD COLUMN IF NOT EXISTS "sortKey" text;--> statement-breakpoint
ALTER TABLE "chapter" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone;--> statement-breakpoint

-- The old unique (projectId, index) is actively hostile to merging: two
-- devices that each append a chapter offline both mint the same index, and
-- the constraint rejects the merge instead of resolving it.
DROP INDEX IF EXISTS "chapter_project_index_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "chapter_project_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chapter_project_sort_idx" ON "chapter" ("projectId","sortKey");
