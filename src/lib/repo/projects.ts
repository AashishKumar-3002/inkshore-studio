/**
 * Project repository — the only place that talks to the database about
 * projects and chapters.
 *
 * Every read and write is scoped by `userId`. There is deliberately no
 * "get project by id" that skips the owner check: a missing project and
 * someone else's project both return null, so the API can answer 404 for
 * both and never leak that an id exists.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import { db } from "@/lib/db";
import { bibleSections, chapters, projects } from "@/lib/db/schema";
import {
  AISettings,
  SECTION_IDS,
  SectionId,
  StoryBible,
  Chapter,
  ClientProject,
  ImageSettings,
  Project,
  defaultAISettings,
  defaultBookMeta,
  defaultImageSettings,
  defaultRollingSummary,
  emptyStoryBible,
  emptyStoryboard,
} from "@/lib/types";
import { hasSecret } from "@/lib/crypto";

type ProjectRow = typeof projects.$inferSelect;
type ChapterRow = typeof chapters.$inferSelect;

/**
 * `ordinal` is the chapter's 1-based position in the project as loaded, not a
 * stored value. Position is presentation — "Chapter 3" — while identity is
 * the id and order is the sortKey. Storing it would mean rewriting every
 * later chapter whenever one is inserted or removed.
 */
function toChapter(row: ChapterRow, ordinal: number): Chapter {
  return {
    id: row.id,
    index: ordinal,
    title: row.title,
    idea: row.idea,
    content: row.content,
    summary: row.summary,
    status: row.status as Chapter["status"],
    wordCount: row.wordCount,
    locked: row.locked,
    mode: row.mode === "manual" ? "manual" : "ai",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toProject(
  row: ProjectRow,
  chapterRows: ChapterRow[],
  bible: StoryBible = emptyStoryBible()
): Project {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    onboardingComplete: row.onboardingComplete,
    storyBible: bible,
    chapters: chapterRows.map((c, i) => toChapter(c, i + 1)),
    aiSettings: { ...defaultAISettings(), ...(row.aiSettings ?? {}) },
    imageSettings: { ...defaultImageSettings(), ...(row.imageSettings ?? {}) },
    book: { ...defaultBookMeta(), ...(row.book ?? {}) },
    rollingSummary: { ...defaultRollingSummary(), ...(row.rollingSummary ?? {}) },
    storyboard: { ...emptyStoryboard(), ...(row.storyboard ?? {}) },
  };
}

/** Strips secrets so a project can safely be serialized to the browser. */
export function toClientProject(project: Project): ClientProject {
  // `apiKey`/`apiKeyProvider` are pulled off defensively too: they are
  // transport-only inputs, but a document written by an older build could
  // still carry them, and this is the last gate before the wire.
  const {
    apiKeys,
    ...aiRest
  } = project.aiSettings as AISettings & { apiKey?: string; apiKeyProvider?: string };
  delete (aiRest as { apiKey?: string }).apiKey;
  delete (aiRest as { apiKeyProvider?: string }).apiKeyProvider;

  const { apiKey, ...imageRest } = project.imageSettings;
  const configuredKeys: Partial<Record<keyof typeof apiKeys, boolean>> = {};
  for (const [providerId, value] of Object.entries(apiKeys ?? {})) {
    if (hasSecret(value)) {
      configuredKeys[providerId as keyof typeof apiKeys] = true;
    }
  }
  return {
    ...project,
    aiSettings: { ...aiRest, configuredKeys },
    imageSettings: { ...imageRest, hasApiKey: hasSecret(apiKey) },
  };
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

type SectionRow = typeof bibleSections.$inferSelect;

/** Rebuilds a StoryBible from its rows, filling in sections never written. */
function toStoryBible(rows: SectionRow[]): StoryBible {
  const bible = emptyStoryBible();
  for (const row of rows) {
    if ((SECTION_IDS as readonly string[]).includes(row.sectionId)) {
      bible[row.sectionId as SectionId] = {
        answers: row.answers ?? {},
        notes: row.notes ?? "",
      };
    }
  }
  return bible;
}

async function loadBible(projectId: string): Promise<StoryBible> {
  const rows = await db
    .select()
    .from(bibleSections)
    .where(eq(bibleSections.projectId, projectId));
  return toStoryBible(rows);
}

/**
 * Upserts only the sections that actually differ from what's stored. Writing
 * all ten every time would touch rows the author never opened, and on merge
 * those no-op writes look exactly like real edits.
 */
export async function saveBible(
  projectId: string,
  userId: string,
  next: StoryBible
): Promise<Project | null> {
  const project = await getProjectMeta(projectId, userId);
  if (!project) return null;
  const current = project.storyBible;
  const now = new Date();

  const changed = SECTION_IDS.filter((id) => {
    const a = current[id];
    const b = next[id];
    if (!b) return false;
    return (
      (a?.notes ?? "") !== (b.notes ?? "") ||
      JSON.stringify(a?.answers ?? {}) !== JSON.stringify(b.answers ?? {})
    );
  });
  if (changed.length === 0) return project;

  await db.transaction(async (tx) => {
    for (const id of changed) {
      await tx
        .insert(bibleSections)
        .values({
          projectId,
          sectionId: id,
          answers: next[id].answers ?? {},
          notes: next[id].notes ?? "",
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [bibleSections.projectId, bibleSections.sectionId],
          set: {
            answers: next[id].answers ?? {},
            notes: next[id].notes ?? "",
            updatedAt: now,
          },
        });
    }
    await tx.update(projects).set({ updatedAt: now }).where(eq(projects.id, projectId));
  });
  return getProjectMeta(projectId, userId);
}

/** Project summaries for the dashboard — no chapter bodies loaded. */
export async function listProjects(userId: string) {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      onboardingComplete: projects.onboardingComplete,
      book: projects.book,
      chapterCount: sql<number>`(
        select count(*)::int from ${chapters}
        where ${chapters.projectId} = ${projects.id}
          and ${chapters.deletedAt} is null
      )`,
      wordCount: sql<number>`(
        select coalesce(sum(${chapters.wordCount}), 0)::int
        from ${chapters}
        where ${chapters.projectId} = ${projects.id}
          and ${chapters.deletedAt} is null
      )`,
    })
    .from(projects)
    .where(and(eq(projects.userId, userId), isNull(projects.deletedAt)))
    .orderBy(sql`${projects.updatedAt} desc`);

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getProject(id: string, userId: string): Promise<Project | null> {
  const [row] = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, id), eq(projects.userId, userId), isNull(projects.deletedAt))
    )
    .limit(1);
  if (!row) return null;
  const chapterRows = await db
    .select()
    .from(chapters)
    .where(and(eq(chapters.projectId, id), isNull(chapters.deletedAt)))
    // Ties on sortKey are possible by design, so id breaks them — without a
    // second key the order of two same-key chapters would vary per query.
    .orderBy(asc(chapters.sortKey), asc(chapters.id));
  return toProject(row, chapterRows, await loadBible(id));
}

/** Loads a project without its chapter bodies — for settings-only writes. */
export async function getProjectMeta(id: string, userId: string): Promise<Project | null> {
  const [row] = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, id), eq(projects.userId, userId), isNull(projects.deletedAt))
    )
    .limit(1);
  // The bible is ten small rows and every prompt builder reads it, so it
  // rides along rather than forcing callers to a second query.
  return row ? toProject(row, [], await loadBible(id)) : null;
}

export async function getChapter(
  projectId: string,
  chapterId: string,
  userId: string
): Promise<{ project: Project; chapter: Chapter } | null> {
  const project = await getProjectMeta(projectId, userId);
  if (!project) return null;
  const [row] = await db
    .select()
    .from(chapters)
    .where(
      and(
        eq(chapters.id, chapterId),
        eq(chapters.projectId, projectId),
        isNull(chapters.deletedAt)
      )
    )
    .limit(1);
  if (!row) return null;
  return { project, chapter: toChapter(row, await ordinalOf(projectId, row)) };
}

/* ------------------------------------------------------------------ */
/* Project writes                                                      */
/* ------------------------------------------------------------------ */

type ProjectDocPatch = Partial<
  Pick<
    Project,
    | "name"
    | "onboardingComplete"
    | "aiSettings"
    | "imageSettings"
    | "book"
    | "rollingSummary"
    | "storyboard"
  >
>;

/**
 * Patches the project row. Only the fields present in `patch` are written,
 * so two concurrent writes to different parts of a project don't clobber
 * each other the way a whole-document save would.
 */
export async function updateProject(
  id: string,
  userId: string,
  patch: ProjectDocPatch
): Promise<Project | null> {
  const [row] = await db
    .update(projects)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning();
  return row ? toProject(row, [], await loadBible(id)) : null;
}

/** Bumps updatedAt so the dashboard's "recently worked on" order is right. */
export async function touchProject(id: string, userId: string): Promise<void> {
  await db
    .update(projects)
    .set({ updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
}

export async function createProject(userId: string, name: string): Promise<Project> {
  const [row] = await db
    .insert(projects)
    .values({
      userId,
      name: name.trim() || "Untitled Novel",
      onboardingComplete: false,
      aiSettings: defaultAISettings(),
      imageSettings: defaultImageSettings(),
      book: defaultBookMeta(),
      rollingSummary: defaultRollingSummary(),
      storyboard: emptyStoryboard(),
    })
    .returning();
  await db.insert(bibleSections).values(
    SECTION_IDS.map((sectionId) => ({
      projectId: row.id,
      sectionId,
      answers: {},
      notes: "",
    }))
  );
  return toProject(row, []);
}

export async function deleteProject(id: string, userId: string): Promise<boolean> {
  const now = new Date();
  const deleted = await db
    .update(projects)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(eq(projects.id, id), eq(projects.userId, userId), isNull(projects.deletedAt))
    )
    .returning({ id: projects.id });
  return deleted.length > 0;
}

/**
 * Imports an `.inkshore.json` export, including the legacy `.inkdrop.json`
 * format, as a brand-new project owned by the
 * importer. API keys in the file are discarded rather than trusted — an
 * export shared between people must never carry credentials across.
 */
export async function importProject(
  userId: string,
  data: Partial<Project>,
  nameOverride?: string
): Promise<Project> {
  const aiSettings: AISettings = {
    ...defaultAISettings(),
    ...(data.aiSettings ?? {}),
    apiKeys: {},
  };
  const imageSettings: ImageSettings = {
    ...defaultImageSettings(),
    ...(data.imageSettings ?? {}),
    apiKey: "",
  };

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(projects)
      .values({
        userId,
        name: (nameOverride || data.name || "Imported Novel").trim(),
        onboardingComplete: Boolean(data.onboardingComplete),
        aiSettings,
        imageSettings,
        book: { ...defaultBookMeta(), ...(data.book ?? {}) },
        rollingSummary: { ...defaultRollingSummary(), ...(data.rollingSummary ?? {}) },
        storyboard: { ...emptyStoryboard(), ...(data.storyboard ?? {}) },
      })
      .returning();

    const imported = data.storyBible ?? emptyStoryBible();
    await tx.insert(bibleSections).values(
      SECTION_IDS.map((sectionId) => ({
        projectId: row.id,
        sectionId,
        answers: imported[sectionId]?.answers ?? {},
        notes: imported[sectionId]?.notes ?? "",
      }))
    );

    const incoming = (data.chapters ?? []).slice().sort((a, b) => a.index - b.index);
    if (incoming.length > 0) {
      // The file's indexes only tell us the intended order; the keys are
      // minted fresh, so an export with gaps or duplicates imports cleanly.
      const keys = generateNKeysBetween(null, null, incoming.length);
      await tx.insert(chapters).values(
        incoming.map((c, i) => ({
          projectId: row.id,
          sortKey: keys[i],
          title: c.title || `Chapter ${i + 1}`,
          idea: c.idea ?? "",
          content: c.content ?? "",
          summary: c.summary ?? "",
          status: c.status ?? (c.content ? "drafted" : "idea"),
          wordCount: wordCount(c.content ?? ""),
          locked: Boolean(c.locked),
          mode: c.mode === "manual" ? "manual" : "ai",
        }))
      );
    }

    const chapterRows = await tx
      .select()
      .from(chapters)
      .where(eq(chapters.projectId, row.id))
      .orderBy(asc(chapters.sortKey), asc(chapters.id));
    return toProject(row, chapterRows, toStoryBible(await tx
      .select()
      .from(bibleSections)
      .where(eq(bibleSections.projectId, row.id))));
  });
}

/* ------------------------------------------------------------------ */
/* Chapter writes                                                      */
/* ------------------------------------------------------------------ */

/** Anything that can run a query — the pool, or a transaction handle. */
type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

/**
 * The last live chapter's sortKey and how many live chapters there are.
 * Both come from one scan so an append needs a single round trip.
 */
async function tailOf(
  tx: Queryable,
  projectId: string
): Promise<{ lastKey: string | null; count: number }> {
  const rows = await tx
    .select({ sortKey: chapters.sortKey })
    .from(chapters)
    .where(and(eq(chapters.projectId, projectId), isNull(chapters.deletedAt)))
    .orderBy(asc(chapters.sortKey), asc(chapters.id));
  return {
    lastKey: rows.length > 0 ? rows[rows.length - 1].sortKey : null,
    count: rows.length,
  };
}

/** A chapter's 1-based position among its project's live chapters. */
async function ordinalOf(projectId: string, row: ChapterRow): Promise<number> {
  const rows = await db
    .select({ id: chapters.id })
    .from(chapters)
    .where(and(eq(chapters.projectId, projectId), isNull(chapters.deletedAt)))
    .orderBy(asc(chapters.sortKey), asc(chapters.id));
  const at = rows.findIndex((r) => r.id === row.id);
  return at === -1 ? rows.length + 1 : at + 1;
}

/**
 * Bumps updatedAt from inside a chapter write, which already knows the
 * project is the caller's — unlike the exported touchProject, which
 * re-checks ownership because it is reached straight from a route.
 */
async function bumpProject(tx: Queryable, projectId: string): Promise<void> {
  await tx
    .update(projects)
    .set({ updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}


export async function createChapter(
  projectId: string,
  input: {
    title?: string;
    idea?: string;
    content?: string;
    status?: Chapter["status"];
    mode?: Chapter["mode"];
  }
): Promise<Chapter> {
  const content = input.content ?? "";
  return db.transaction(async (tx) => {
    const { lastKey, count } = await tailOf(tx, projectId);
    const sortKey = generateKeyBetween(lastKey, null);

    const [row] = await tx
      .insert(chapters)
      .values({
        projectId,
        sortKey,
        title: input.title?.trim() || `Chapter ${count + 1}`,
        idea: input.idea ?? "",
        content,
        status: input.status ?? (content ? "drafted" : "idea"),
        wordCount: wordCount(content),
        mode: input.mode === "manual" ? "manual" : "ai",
      })
      .returning();

    await bumpProject(tx, projectId);
    return toChapter(row, count + 1);
  });
}

export async function updateChapter(
  projectId: string,
  chapterId: string,
  patch: Partial<
    Pick<
      Chapter,
      "title" | "idea" | "content" | "summary" | "status" | "locked" | "mode"
    >
  >
): Promise<Chapter | null> {
  const values: Record<string, unknown> = { ...patch, updatedAt: new Date() };
  if (typeof patch.content === "string") values.wordCount = wordCount(patch.content);

  const [row] = await db
    .update(chapters)
    .set(values)
    .where(
      and(
        eq(chapters.id, chapterId),
        eq(chapters.projectId, projectId),
        isNull(chapters.deletedAt)
      )
    )
    .returning();
  if (!row) return null;
  await bumpProject(db, projectId);
  return toChapter(row, await ordinalOf(projectId, row));
}

/**
 * Tombstones a chapter. Nothing after it is touched: with a fractional
 * sortKey the surviving chapters are already in the right order, and their
 * displayed numbers fall out of their positions on the next read.
 */
export async function deleteChapter(
  projectId: string,
  chapterId: string
): Promise<boolean> {
  const now = new Date();
  const deleted = await db
    .update(chapters)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(chapters.id, chapterId),
        eq(chapters.projectId, projectId),
        isNull(chapters.deletedAt)
      )
    )
    .returning({ id: chapters.id });
  if (deleted.length === 0) return false;
  await bumpProject(db, projectId);
  return true;
}

/** Bulk chapter upload — appended in order, in one transaction. */
export async function createChapters(
  projectId: string,
  items: { title: string; content: string; status: Chapter["status"] }[]
): Promise<Chapter[]> {
  if (items.length === 0) return [];
  return db.transaction(async (tx) => {
    const { lastKey, count } = await tailOf(tx, projectId);
    const keys = generateNKeysBetween(lastKey, null, items.length);

    const rows = await tx
      .insert(chapters)
      .values(
        items.map((item, i) => ({
          projectId,
          sortKey: keys[i],
          title: item.title?.trim() || `Chapter ${count + i + 1}`,
          content: item.content,
          status: item.status,
          wordCount: wordCount(item.content),
          mode: "manual" as const,
        }))
      )
      .returning();

    await bumpProject(tx, projectId);
    return rows.map((row, i) => toChapter(row, count + i + 1));
  });
}

/* ------------------------------------------------------------------ */
/* Settings helpers                                                    */
/* ------------------------------------------------------------------ */

// Pure logic, defined in lib/settings.ts so it's testable without a database.
export { mergeAISettings, mergeImageSettings } from "@/lib/settings";
