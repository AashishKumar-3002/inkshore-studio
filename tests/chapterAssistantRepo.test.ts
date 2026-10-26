import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { defaultAISettings, defaultBookMeta, defaultImageSettings, defaultRollingSummary, emptyStoryboard } from "@/lib/types";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ get db() { return state.db; } }));
vi.mock("@/lib/apiHelpers", () => ({ ApiProblem: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
import { applyAssistantResult, assistantHistory, dismissAssistantResult, saveAssistantResult, saveChapterVersion } from "@/lib/repo/chapterAssistant";
const client = new PGlite();
const database = drizzle(client, { schema });
state.db = database;
const source = "Opening.\n\nSelected text.\n\nClosing.";
beforeAll(async () => {
  await migrate(database, { migrationsFolder: "drizzle" });
  await database.insert(schema.users).values({ id: "owner", email: "owner@example.com" });
  await database.insert(schema.projects).values({ id: "p", userId: "owner", name: "Test", aiSettings: defaultAISettings(), imageSettings: defaultImageSettings(), book: defaultBookMeta(), rollingSummary: { ...defaultRollingSummary(), entries: [{ chapterId: "c", summary: "Old summary", chapterTitle: "Test", createdAt: new Date().toISOString() }] }, storyboard: emptyStoryboard() });
  await database.insert(schema.chapters).values({ id: "c", projectId: "p", sortKey: "a0", title: "Test", content: source, summary: "Old summary" });
}, 30000);
beforeEach(async () => {
  await database.delete(schema.chapterAssistantEntries);
  await database.update(schema.chapters).set({ content: source, locked: false, deletedAt: null, summary: "Old summary" });
});
afterAll(() => client.close());

describe("atomic chapter assistant apply", () => {
  it("saves a named manual version only for the owner and current chapter content", async () => {
    await expect(saveChapterVersion("p", "c", "someone-else", source, "Opening draft")).rejects.toMatchObject({ status: 404 });
    await expect(saveChapterVersion("p", "c", "owner", "older text", "Opening draft")).rejects.toMatchObject({ status: 409 });
    const version = await saveChapterVersion("p", "c", "owner", source, "Opening draft");
    expect(version.kind).toBe("version");
    expect(version.sourceContent).toBe(source);
    expect(version.payload.label).toBe("Opening draft");
    expect((await assistantHistory("p", "c", "owner"))[0].id).toBe(version.id);
  });
  it("scopes history and every write to the chapter owner", async () => {
    expect(await assistantHistory("p", "c", "someone-else")).toEqual([]);
    await expect(saveAssistantResult("p", "c", "someone-else", source, { action: "rewrite", replacement: "x" })).rejects.toMatchObject({ status: 404 });
  });
  it("changes only the selection, saves its original, invalidates summaries, and supports restore", async () => {
    const start = source.indexOf("Selected text.");
    const entry = await saveAssistantResult("p", "c", "owner", source, { action: "rewrite", selection: { start, end: start + "Selected text.".length }, replacement: "A better passage." });
    await expect(applyAssistantResult("p", "c", "someone-else", entry.id, source)).rejects.toMatchObject({ status: 404 });
    await expect(applyAssistantResult("p", "c", "owner", entry.id, "stale text")).rejects.toMatchObject({ status: 409 });
    await database.update(schema.chapters).set({ locked: true }).where(eq(schema.chapters.id, "c"));
    await expect(applyAssistantResult("p", "c", "owner", entry.id, source)).rejects.toMatchObject({ status: 409 });
    await database.update(schema.chapters).set({ locked: false }).where(eq(schema.chapters.id, "c"));
    const version = await applyAssistantResult("p", "c", "owner", entry.id, source);
    const revised = source.replace("Selected text.", "A better passage.");
    expect(version.sourceContent).toBe(source);
    const [chapter] = await database.select().from(schema.chapters);
    expect(chapter.content).toBe(revised); expect(chapter.summary).toBe(""); expect(chapter.wordCount).toBe(5);
    const [project] = await database.select().from(schema.projects);
    expect(project.rollingSummary.entries).toEqual([]);
    await expect(applyAssistantResult("p", "c", "owner", entry.id, revised)).rejects.toMatchObject({ status: 400 });
    const undoVersion = await applyAssistantResult("p", "c", "owner", version.id, revised);
    expect(undoVersion.sourceContent).toBe(revised);
    expect((await database.select().from(schema.chapters))[0].content).toBe(source);
  });
  it("applies individual passages, rejects invalid choices, and tombstones discarded results", async () => {
    const entry = await saveAssistantResult("p", "c", "owner", source, { action: "humanize", replacement: "New opening.\n\nSelected text.\n\nNew closing." });
    await expect(applyAssistantResult("p", "c", "owner", entry.id, source, [9])).rejects.toMatchObject({ status: 400 });
    await applyAssistantResult("p", "c", "owner", entry.id, source, [1]);
    expect((await database.select().from(schema.chapters))[0].content).toBe("Opening.\n\nSelected text.\n\nNew closing.");
    const retained = (await assistantHistory("p", "c", "owner")).find(item => item.id === entry.id)!;
    expect(retained.payload.appliedChanges).toEqual([1]);
    const partial = "Opening.\n\nSelected text.\n\nNew closing.";
    await expect(applyAssistantResult("p", "c", "owner", entry.id, partial + " manual change", [0])).rejects.toMatchObject({ status: 409 });
    await expect(applyAssistantResult("p", "c", "owner", entry.id, partial, [1])).rejects.toMatchObject({ status: 400 });
    await applyAssistantResult("p", "c", "owner", entry.id, partial, [0]);
    expect((await database.select().from(schema.chapters))[0].content).toBe("New opening.\n\nSelected text.\n\nNew closing.");
    await dismissAssistantResult("p", "c", "owner", entry.id);
    expect((await assistantHistory("p", "c", "owner")).some(item => item.id === entry.id)).toBe(false);
    expect((await database.select().from(schema.chapterAssistantEntries).where(eq(schema.chapterAssistantEntries.id, entry.id)))[0].deletedAt).not.toBeNull();
  });
  it("accepts only one of two competing revisions of the same source", async () => {
    const a = await saveAssistantResult("p", "c", "owner", source, { action: "rewrite", replacement: "First revision." });
    const b = await saveAssistantResult("p", "c", "owner", source, { action: "rewrite", replacement: "Second revision." });
    const results = await Promise.allSettled([
      applyAssistantResult("p", "c", "owner", a.id, source),
      applyAssistantResult("p", "c", "owner", b.id, source),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toMatchObject({ status: 409 });
    expect((await database.select().from(schema.chapterAssistantEntries).where(eq(schema.chapterAssistantEntries.kind, "version")))).toHaveLength(1);
  });
  it("doesn't apply an answer or leak a deleted chapter", async () => {
    const current = (await database.select().from(schema.chapters))[0].content;
    const entry = await saveAssistantResult("p", "c", "owner", current, { action: "ask", answer: "Some advice." });
    await expect(applyAssistantResult("p", "c", "owner", entry.id, current)).rejects.toMatchObject({ status: 400 });
    await database.update(schema.chapters).set({ deletedAt: new Date() }).where(eq(schema.chapters.id, "c"));
    expect(await assistantHistory("p", "c", "owner")).toEqual([]);
    await expect(applyAssistantResult("p", "c", "owner", entry.id, current)).rejects.toMatchObject({ status: 404 });
  });
});
