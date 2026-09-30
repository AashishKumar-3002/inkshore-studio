import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { asc, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { defaultAISettings, defaultBookMeta, defaultImageSettings, defaultRollingSummary, emptyStoryboard } from "@/lib/types";
import type { MasterCommandPayload } from "@/lib/masterCommand";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ get db() { return state.db; } }));
vi.mock("@/lib/apiHelpers", () => ({ ApiProblem: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
import { applyCommandRun, commandRunHistory, dismissCommandRun, saveCommandRun } from "@/lib/repo/masterCommand";

const client = new PGlite();
const database = drizzle(client, { schema });
state.db = database;

const planPayload: MasterCommandPayload = {
  reply: "Here are two chapters.",
  intent: "plan_chapters",
  actions: [{ type: "plan_chapters", chapters: [{ title: "The Ledger", idea: "She finds the accounts." }, { title: "Low Tide", idea: "He confesses." }] }],
  previews: [{ title: "Add 2 chapters", detail: "…" }],
};
const notePayload: MasterCommandPayload = {
  reply: "Noted.",
  intent: "update_bible",
  actions: [{ type: "update_bible", sectionId: "protagonist", notes: "He is afraid of open water." }],
  previews: [{ title: "Add a note", detail: "…", before: "He was a fisherman.", after: "…" }],
};
const answerPayload: MasterCommandPayload = { reply: "I'd bring the sister back.", intent: "answer", actions: [], previews: [] };

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "drizzle" });
  await database.insert(schema.users).values({ id: "owner", email: "owner@example.com" });
  await database.insert(schema.projects).values({ id: "p", userId: "owner", name: "Test", aiSettings: defaultAISettings(), imageSettings: defaultImageSettings(), book: defaultBookMeta(), rollingSummary: defaultRollingSummary(), storyboard: emptyStoryboard() });
}, 30000);

beforeEach(async () => {
  await database.delete(schema.projectCommandRuns);
  await database.delete(schema.chapters);
  await database.delete(schema.bibleSections);
});
afterAll(() => client.close());

const chapterRows = () => database.select().from(schema.chapters).orderBy(asc(schema.chapters.sortKey), asc(schema.chapters.id));

describe("master command runs", () => {
  it("scopes history and every write to the project owner", async () => {
    const run = await saveCommandRun("p", "owner", "Plan two chapters", planPayload);
    expect(await commandRunHistory("p", "someone-else")).toEqual([]);
    await expect(saveCommandRun("p", "someone-else", "Plan two chapters", planPayload)).rejects.toMatchObject({ status: 404 });
    await expect(applyCommandRun("p", "someone-else", run.id, "key-1")).rejects.toMatchObject({ status: 404 });
    await expect(dismissCommandRun("p", "someone-else", run.id)).rejects.toMatchObject({ status: 404 });
    expect(await chapterRows()).toHaveLength(0);
  });

  it("writes nothing until the run is confirmed", async () => {
    const run = await saveCommandRun("p", "owner", "Plan two chapters", planPayload);
    expect(run.status).toBe("proposed");
    expect(run.appliedAt).toBeNull();
    expect(await chapterRows()).toHaveLength(0);

    const applied = await applyCommandRun("p", "owner", run.id, "key-1");
    expect(applied.run.status).toBe("applied");
    expect(applied.chapters.map(chapter => chapter.title)).toEqual(["The Ledger", "Low Tide"]);
    const rows = await chapterRows();
    expect(rows.map(row => [row.title, row.idea, row.status, row.content])).toEqual([
      ["The Ledger", "She finds the accounts.", "idea", ""],
      ["Low Tide", "He confesses.", "idea", ""],
    ]);
  });

  it("treats a replayed confirm as a no-op and a second key as a conflict", async () => {
    const run = await saveCommandRun("p", "owner", "Plan two chapters", planPayload);
    await applyCommandRun("p", "owner", run.id, "key-1");
    const replay = await applyCommandRun("p", "owner", run.id, "key-1");
    expect(replay.run.status).toBe("applied");
    expect(replay.chapters).toEqual([]);
    expect(await chapterRows()).toHaveLength(2);
    await expect(applyCommandRun("p", "owner", run.id, "key-2")).rejects.toMatchObject({ status: 409 });
    expect(await chapterRows()).toHaveLength(2);
  });

  it("appends a bible note to what is stored, preserving the author's own words", async () => {
    await database.insert(schema.bibleSections).values({ projectId: "p", sectionId: "protagonist", answers: { q1: { selected: ["a"], custom: "" } }, notes: "He was a fisherman." });
    const run = await saveCommandRun("p", "owner", "Note his fear of water", notePayload);
    await applyCommandRun("p", "owner", run.id, "key-1");
    const [section] = await database.select().from(schema.bibleSections);
    expect(section.notes).toBe("He was a fisherman.\n\nHe is afraid of open water.");
    expect(section.answers).toEqual({ q1: { selected: ["a"], custom: "" } });
  });

  it("refuses to apply a dismissed run or one that proposed nothing", async () => {
    const dismissed = await saveCommandRun("p", "owner", "Plan two chapters", planPayload);
    await dismissCommandRun("p", "owner", dismissed.id);
    await expect(applyCommandRun("p", "owner", dismissed.id, "key-1")).rejects.toMatchObject({ status: 404 });
    expect(await commandRunHistory("p", "owner")).toHaveLength(0);

    const conversational = await saveCommandRun("p", "owner", "What next?", answerPayload);
    await expect(applyCommandRun("p", "owner", conversational.id, "key-2")).rejects.toMatchObject({ status: 400 });
    expect(await chapterRows()).toHaveLength(0);
  });

  it("returns history newest first and keeps the applied run visible", async () => {
    const first = await saveCommandRun("p", "owner", "What next?", answerPayload);
    // Both rows would otherwise be stamped in the same millisecond, which the
    // clock never does between two commands a person actually typed.
    await database.update(schema.projectCommandRuns).set({ createdAt: new Date("2026-09-28T10:00:00Z") }).where(eq(schema.projectCommandRuns.id, first.id));
    const second = await saveCommandRun("p", "owner", "Plan two chapters", planPayload);
    await applyCommandRun("p", "owner", second.id, "key-1");
    const history = await commandRunHistory("p", "owner");
    expect(history.map(run => run.id)).toEqual([second.id, first.id]);
    expect(history[0].status).toBe("applied");
    expect(history[0].appliedAt).not.toBeNull();
  });
});
