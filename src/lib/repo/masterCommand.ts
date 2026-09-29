/**
 * Master command runs — proposals, and the one place a confirmed proposal
 * turns into writes.
 *
 * Nothing here builds a query from model output. The action union in
 * lib/masterCommand.ts is the only thing that crosses this boundary, and each
 * variant is dispatched by hand to an existing repository function.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { bibleSections, projectCommandRuns as runs, projects } from "@/lib/db/schema";
import { ApiProblem } from "@/lib/apiHelpers";
import { appendBibleNotes, type MasterCommandPayload, type MasterCommandRun } from "@/lib/masterCommand";
import { createChapters, saveBibleSection } from "@/lib/repo/projects";
import type { Chapter } from "@/lib/types";

const columns = {
  id: runs.id,
  status: runs.status,
  transcript: runs.transcript,
  payload: runs.payload,
  appliedAt: runs.appliedAt,
  createdAt: runs.createdAt,
};

type RunRow = { id: string; status: MasterCommandRun["status"]; transcript: string; payload: MasterCommandPayload; appliedAt: Date | null; createdAt: Date };
const toRun = (row: RunRow): MasterCommandRun => ({
  ...row,
  appliedAt: row.appliedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

const owned = (projectId: string, userId: string) =>
  and(eq(projects.id, projectId), eq(projects.userId, userId), isNull(projects.deletedAt));

export async function commandRunHistory(projectId: string, userId: string): Promise<MasterCommandRun[]> {
  const rows = await db
    .select(columns)
    .from(runs)
    .innerJoin(projects, eq(runs.projectId, projects.id))
    .where(and(owned(projectId, userId), isNull(runs.deletedAt)))
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .limit(50);
  return rows.map(toRun);
}

export async function saveCommandRun(
  projectId: string,
  userId: string,
  transcript: string,
  payload: MasterCommandPayload
): Promise<MasterCommandRun> {
  return db.transaction(async tx => {
    const [project] = await tx.select({ id: projects.id }).from(projects).where(owned(projectId, userId)).for("update");
    if (!project) throw new ApiProblem(404, "Project not found.");
    const [row] = await tx.insert(runs).values({ projectId, transcript, payload, status: "proposed" }).returning(columns);
    return toRun(row);
  });
}

export async function dismissCommandRun(projectId: string, userId: string, runId: string): Promise<void> {
  await db.transaction(async tx => {
    const [project] = await tx.select({ id: projects.id }).from(projects).where(owned(projectId, userId)).for("update");
    if (!project) throw new ApiProblem(404, "Project not found.");
    const [row] = await tx
      .update(runs)
      .set({ status: "dismissed", deletedAt: new Date() })
      .where(and(eq(runs.id, runId), eq(runs.projectId, projectId), isNull(runs.deletedAt)))
      .returning({ id: runs.id });
    if (!row) throw new ApiProblem(404, "Command not found.");
  });
}

/**
 * Applies a proposal exactly once.
 *
 * The run row is locked for the whole write, so two confirms race on the lock
 * rather than on the chapter table. A replay carrying the key that already
 * applied this run is answered with the stored result — the author's retry
 * after a dropped response must not mint a second set of chapters.
 */
export async function applyCommandRun(
  projectId: string,
  userId: string,
  runId: string,
  idempotencyKey: string
): Promise<{ run: MasterCommandRun; chapters: Chapter[] }> {
  return db.transaction(async tx => {
    const [row] = await tx
      .select({ ...columns, idempotencyKey: runs.idempotencyKey })
      .from(runs)
      .innerJoin(projects, eq(runs.projectId, projects.id))
      .where(and(owned(projectId, userId), eq(runs.id, runId), isNull(runs.deletedAt)))
      .for("update");
    if (!row) throw new ApiProblem(404, "Command not found.");
    if (row.status === "applied") {
      if (row.idempotencyKey === idempotencyKey) return { run: toRun(row), chapters: [] };
      throw new ApiProblem(409, "This command has already been applied.");
    }
    // A dismissed run is tombstoned, so it never reaches here — the query
    // above already answered 404 for it.
    if (!row.payload.actions.length) throw new ApiProblem(400, "This reply proposed nothing to apply.");

    const created: Chapter[] = [];
    for (const action of row.payload.actions) {
      if (action.type === "plan_chapters") {
        created.push(
          ...(await createChapters(
            projectId,
            action.chapters.map(chapter => ({ title: chapter.title, idea: chapter.idea, content: "", status: "idea" as const, mode: "ai" as const })),
            tx
          ))
        );
      } else {
        // Re-read inside the transaction: the notes being appended to are the
        // ones on disk now, not the ones the preview was built from.
        const [section] = await tx
          .select()
          .from(bibleSections)
          .where(and(eq(bibleSections.projectId, projectId), eq(bibleSections.sectionId, action.sectionId)));
        await saveBibleSection(tx, projectId, action.sectionId, {
          answers: section?.answers ?? {},
          notes: appendBibleNotes(section?.notes ?? "", action.notes),
        });
      }
    }

    const [updated] = await tx
      .update(runs)
      .set({ status: "applied", idempotencyKey, appliedAt: new Date() })
      .where(eq(runs.id, runId))
      .returning(columns);
    return { run: toRun(updated), chapters: created };
  });
}
