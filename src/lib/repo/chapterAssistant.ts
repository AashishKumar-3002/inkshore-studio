import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { chapterAssistantEntries as entries, chapters, projects } from "@/lib/db/schema";
import { ApiProblem } from "@/lib/apiHelpers";
import { comparePassages, applyPassageChanges, type AssistantPayload } from "@/lib/chapterAssistant";

const scope = (projectId: string, chapterId: string, userId: string) => and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId), eq(projects.userId, userId), isNull(chapters.deletedAt), isNull(projects.deletedAt));
export async function assistantHistory(projectId: string, chapterId: string, userId: string) {
  return db.select({ id: entries.id, chapterId: entries.chapterId, kind: entries.kind, sourceContent: entries.sourceContent, payload: entries.payload, createdAt: entries.createdAt })
    .from(entries).innerJoin(chapters, eq(entries.chapterId, chapters.id)).innerJoin(projects, eq(chapters.projectId, projects.id))
    .where(and(scope(projectId, chapterId, userId), isNull(entries.deletedAt))).orderBy(desc(entries.createdAt), desc(entries.id)).limit(50);
}
export async function saveAssistantResult(projectId: string, chapterId: string, userId: string, sourceContent: string, payload: AssistantPayload) {
  return db.transaction(async tx => {
    const [owned] = await tx.select({ id: chapters.id }).from(chapters).innerJoin(projects, eq(chapters.projectId, projects.id)).where(scope(projectId, chapterId, userId)).for("update");
    if (!owned) throw new ApiProblem(404, "Chapter not found.");
    const [entry] = await tx.insert(entries).values({ chapterId, kind: "result", sourceContent, payload }).returning();
    return entry;
  });
}
export async function saveChapterVersion(projectId: string, chapterId: string, userId: string, expectedContent: string, label: string) {
  return db.transaction(async tx => {
    const [owned] = await tx.select({ chapter: chapters }).from(chapters).innerJoin(projects, eq(chapters.projectId, projects.id)).where(scope(projectId, chapterId, userId)).for("update");
    if (!owned) throw new ApiProblem(404, "Chapter not found.");
    if (owned.chapter.content !== expectedContent) throw new ApiProblem(409, "The saved chapter changed. Save or reload it before creating a version.");
    const [entry] = await tx.insert(entries).values({ chapterId, kind: "version", sourceContent: expectedContent, payload: { action: "rewrite", label: label || "Manual checkpoint" } }).returning();
    return entry;
  });
}
export async function dismissAssistantResult(projectId: string, chapterId: string, userId: string, entryId: string) {
  return db.transaction(async tx => {
    const [owned] = await tx.select({ id: chapters.id }).from(chapters).innerJoin(projects, eq(chapters.projectId, projects.id)).where(scope(projectId, chapterId, userId)).for("update");
    if (!owned) throw new ApiProblem(404, "Chapter not found.");
    const [entry] = await tx.update(entries).set({ deletedAt: new Date() }).where(and(eq(entries.id, entryId), eq(entries.chapterId, chapterId), eq(entries.kind, "result"), isNull(entries.deletedAt))).returning({ id: entries.id });
    if (!entry) throw new ApiProblem(404, "Suggestion not found.");
  });
}
/** Snapshot and replacement commit together under a row lock. */
export async function applyAssistantResult(projectId: string, chapterId: string, userId: string, entryId: string, expectedContent: string, acceptedChanges?: number[]) {
  return db.transaction(async tx => {
    const [owned] = await tx.select({ chapter: chapters, project: projects }).from(chapters).innerJoin(projects, eq(chapters.projectId, projects.id)).where(scope(projectId, chapterId, userId)).for("update");
    if (!owned) throw new ApiProblem(404, "Chapter not found.");
    if (owned.chapter.locked) throw new ApiProblem(409, "Unlock this chapter before applying edits.");
    if (owned.chapter.content !== expectedContent) throw new ApiProblem(409, "The saved chapter changed. Save or reload it, then review this suggestion again.");
    const [entry] = await tx.select().from(entries).where(and(eq(entries.id, entryId), eq(entries.chapterId, chapterId), isNull(entries.deletedAt)));
    if (!entry) throw new ApiProblem(404, "Suggestion or version not found.");
    let content: string;
    if (entry.kind === "version") content = entry.sourceContent;
    else {
      // Continue a partial apply only from the exact content this result last wrote.
      // Rebuild from the immutable source so changed selection lengths cannot shift offsets.
      if ((entry.payload.appliedContent ?? entry.sourceContent) !== expectedContent) throw new ApiProblem(409, "The chapter changed since this suggestion. Request a new revision.");
      if (typeof entry.payload.replacement !== "string") throw new ApiProblem(400, "This result isn't an edit.");
      const selection = entry.payload.selection;
      const source = selection ? entry.sourceContent.slice(selection.start, selection.end) : entry.sourceContent;
      const previousChoices = entry.payload.appliedChanges ?? [];
      const requestedChoices = acceptedChanges ?? undefined;
      if (requestedChoices?.some(index => previousChoices.includes(index))) throw new ApiProblem(400, "That passage has already been applied.");
      const allChoices = requestedChoices ? [...previousChoices, ...requestedChoices] : undefined;
      let replacement: string;
      try { replacement = applyPassageChanges(source, entry.payload.replacement, allChoices); }
      catch { throw new ApiProblem(400, "Choose valid passages to apply."); }
      content = selection ? entry.sourceContent.slice(0, selection.start) + replacement + entry.sourceContent.slice(selection.end) : replacement;
    }
    if (content === expectedContent) throw new ApiProblem(400, "There are no changes to apply.");
    const now = new Date();
    const [version] = await tx.insert(entries).values({ chapterId, kind: "version", sourceContent: expectedContent, payload: { action: entry.payload.action, instruction: entry.kind === "version" ? "Before restoring a version" : "Before applying an AI edit" }, createdAt: now }).returning();
    if (entry.kind === "result") {
      const target = entry.payload.selection ? entry.sourceContent.slice(entry.payload.selection.start, entry.payload.selection.end) : entry.sourceContent;
      const chosen = acceptedChanges ?? comparePassages(target, entry.payload.replacement!).map((_, index) => index);
      await tx.update(entries).set({ payload: { ...entry.payload, appliedContent: content, appliedChanges: [...new Set([...(entry.payload.appliedChanges ?? []), ...chosen])] } }).where(eq(entries.id, entry.id));
    }
    await tx.update(chapters).set({ content, wordCount: content.trim() ? content.trim().split(/\s+/).length : 0, status: "drafted", summary: "", updatedAt: now }).where(eq(chapters.id, chapterId));
    await tx.update(projects).set({ updatedAt: now, rollingSummary: { ...owned.project.rollingSummary, entries: owned.project.rollingSummary.entries.filter(item => item.chapterId !== chapterId) } }).where(eq(projects.id, projectId));
    return version;
  });
}
