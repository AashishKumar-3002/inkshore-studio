import type { AssistantEntry, AssistantRequest } from "./chapterAssistant";
import type { MasterCommandRun } from "./masterCommand";
import { withAIActivity } from "./aiActivity";
import {
  AISettings,
  BookMeta,
  Chapter,
  ClientProject,
  ImageSettings,
  RollingSummary,
  Storyboard,
  StoryBible,
} from "./types";
import type { ProviderModel } from "./ai/types";

/** What the dashboard list endpoint returns — no chapter bodies. */
export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  onboardingComplete: boolean;
  book: BookMeta;
  chapterCount: number;
  wordCount: number;
}

export interface ProviderInfo {
  id: string;
  label: string;
  defaultModel: string;
  models: ProviderModel[];
  docsUrl?: string;
  keyHint?: string;
  envVar: string;
  /** True for providers that sign in instead of taking an API key. */
  usesSubscription?: boolean;
}

/** An API error carrying the HTTP status, so callers can special-case 409s. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: Record<string, string[]>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const message =
      typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    // A session that expired mid-session shouldn't surface as a cryptic
    // error — send them to sign in and come back where they were.
    if (res.status === 401 && typeof window !== "undefined") {
      const back = encodeURIComponent(window.location.pathname + window.location.search);
      // A deliberate full-document navigation, not a client-side route change:
      // the session is gone, so every cached RSC payload and client cache
      // entry for this user has to be discarded. This module is plain TS with
      // no access to the router, and a soft push would keep stale data around.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?callbackUrl=${back}`;
    }
    throw new ApiError(
      message,
      res.status,
      body.details as Record<string, string[]> | undefined
    );
  }
  return res.json();
}

const jsonHeaders = { "Content-Type": "application/json" };

function post(url: string, body?: unknown) {
  return fetch(url, {
    method: "POST",
    headers: jsonHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function put(url: string, body: unknown) {
  return fetch(url, { method: "PUT", headers: jsonHeaders, body: JSON.stringify(body) });
}

export const api = {
  /* Projects */
  listProjects: () => fetch("/api/projects").then((r) => json<ProjectSummary[]>(r)),
  createProject: (name: string) =>
    post("/api/projects", { name }).then((r) => json<ClientProject>(r)),
  importProject: (data: unknown) =>
    post("/api/projects/import", data).then((r) => json<ClientProject>(r)),
  getProject: (id: string) =>
    fetch(`/api/projects/${id}`).then((r) => json<ClientProject>(r)),
  updateProject: (id: string, patch: { name?: string; onboardingComplete?: boolean }) =>
    fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(patch),
    }).then((r) => json<ClientProject>(r)),
  deleteProject: (id: string) =>
    fetch(`/api/projects/${id}`, { method: "DELETE" }).then((r) => json(r)),

  /* Story bible */
  saveBible: (id: string, storyBible: StoryBible, onboardingComplete?: boolean) =>
    put(`/api/projects/${id}/bible`, { storyBible, onboardingComplete }).then((r) =>
      json<ClientProject>(r)
    ),
  extractBibleFromText: (id: string, text: string) =>
    withAIActivity("Extracting Bible answers…", "Bible import complete", () =>
      post(`/api/projects/${id}/bible/extract`, { text }).then((r) => json<{ project: ClientProject; filledCount: number }>(r))
    ),

  /* Settings */
  listProviders: () =>
    fetch("/api/providers").then((r) => json<{ providers: ProviderInfo[] }>(r)),
  saveSettings: (
    id: string,
    patch: Partial<Omit<AISettings, "apiKeys">> & {
      apiKey?: string;
      apiKeyProvider?: string;
    }
  ) => put(`/api/projects/${id}/settings`, patch).then((r) => json<ClientProject>(r)),
  saveImageSettings: (id: string, patch: Partial<ImageSettings>) =>
    put(`/api/projects/${id}/image-settings`, patch).then((r) => json<ClientProject>(r)),
  saveRollingSummarySettings: (id: string, patch: Partial<RollingSummary>) =>
    put(`/api/projects/${id}/rolling-summary`, patch).then((r) => json<ClientProject>(r)),

  /* Book & cover */
  saveBook: (id: string, book: Partial<BookMeta>) =>
    put(`/api/projects/${id}/book`, book).then((r) => json<ClientProject>(r)),
  suggestCoverDirections: (id: string, vision: string) =>
    withAIActivity("Finding cover directions…", "Cover directions ready", () => post(`/api/projects/${id}/book/cover/suggest`, { vision }).then((r) => json<{ directions: string[] }>(r))),
  generateCover: (id: string, prompt: string) =>
    withAIActivity("Creating cover art…", "Cover art ready", () => post(`/api/projects/${id}/book/cover/generate`, { prompt }).then((r) => json<{ imageDataUrl: string }>(r))),

  /* Chapters */
  createChapter: (
    id: string,
    data: {
      title?: string;
      idea?: string;
      content?: string;
      status?: Chapter["status"];
      mode?: Chapter["mode"];
    }
  ) => post(`/api/projects/${id}/chapters`, data).then((r) => json<Chapter>(r)),
  createChapters: (
    id: string,
    chapters: { title: string; content: string; status: Chapter["status"] }[]
  ) =>
    post(`/api/projects/${id}/chapters`, { chapters }).then((r) =>
      json<{ chapters: Chapter[] }>(r)
    ),
  updateChapter: (id: string, chapterId: string, patch: Partial<Chapter>) =>
    fetch(`/api/projects/${id}/chapters/${chapterId}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(patch),
    }).then((r) => json<Chapter>(r)),
  deleteChapter: (id: string, chapterId: string) =>
    fetch(`/api/projects/${id}/chapters/${chapterId}`, { method: "DELETE" }).then((r) =>
      json(r)
    ),
  suggestChapterTitle: (id: string, chapterId: string) =>
    withAIActivity("Finding a chapter title…", "Chapter title ready", () => post(`/api/projects/${id}/chapters/${chapterId}/suggest-title`).then((r) => json<{ title: string }>(r))),

  /** Streams a chapter draft, calling onChunk as text arrives. */
  generateChapter: async (
    id: string,
    chapterId: string,
    opts: { provider?: string; model?: string },
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> => withAIActivity("Preparing chapter…", "Chapter generation complete", async (update) => {
    const res = await fetch(`/api/projects/${id}/chapters/${chapterId}/generate`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(opts),
      signal,
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}) as Record<string, unknown>);
      throw new ApiError(
        typeof body.error === "string" ? body.error : "Generation failed to start",
        res.status
      );
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let pending = "";
    let completed = false;
    const consume = (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as { type: string; text?: string; heading?: string; message?: string };
      if (event.type === "status" && event.heading) update(event.heading);
      if (event.type === "text" && typeof event.text === "string") { full += event.text; onChunk(event.text); }
      if (event.type === "error") throw new ApiError(event.message || "Generation failed", 500);
      if (event.type === "complete") completed = true;
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() || "";
        lines.forEach(consume);
        if (done) { consume(pending); break; }
      }
      if (!completed) throw new ApiError("Chapter generation ended unexpectedly", 500);
      return full;
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
  }),

  /* Chapter assistant */
  chapterAssistantHistory: (id: string, chapterId: string) =>
    fetch(`/api/projects/${id}/chapters/${chapterId}/assistant`).then(r => json<AssistantEntry[]>(r)),
  runChapterAssistant: (id: string, chapterId: string, request: AssistantRequest, signal?: AbortSignal) => {
    const headings = { ask: "Considering your question…", rewrite: "Preparing a revision…", analyze: "Analyzing chapter…", humanize: "Polishing your writing…" };
    return withAIActivity(headings[request.action], request.action === "analyze" ? "Chapter analysis ready" : "Assistant response ready", () =>
      fetch(`/api/projects/${id}/chapters/${chapterId}/assistant`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(request), signal }).then(r => json<AssistantEntry>(r))
    );
  },
  applyChapterAssistant: (id: string, chapterId: string, entryId: string, expectedContent: string, acceptedChanges?: number[]) =>
    post(`/api/projects/${id}/chapters/${chapterId}/assistant/apply`, { entryId, expectedContent, acceptedChanges }).then(r => json<{ chapter: Chapter; version: AssistantEntry }>(r)),
  dismissChapterAssistant: (id: string, chapterId: string, entryId: string) =>
    fetch(`/api/projects/${id}/chapters/${chapterId}/assistant`, { method: "DELETE", headers: jsonHeaders, body: JSON.stringify({ entryId }) }).then(r => json<{ ok: boolean }>(r)),

  /* Master command */
  masterCommandHistory: (id: string) =>
    fetch(`/api/projects/${id}/master-command`).then(r => json<MasterCommandRun[]>(r)),
  runMasterCommand: (id: string, transcript: string, signal?: AbortSignal) =>
    withAIActivity("Thinking about your book…", "Command ready", () =>
      fetch(`/api/projects/${id}/master-command`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ transcript }), signal }).then(r => json<MasterCommandRun>(r))
    ),
  /** `idempotencyKey` is minted once per run, so retrying a failed confirm can't apply it twice. */
  applyMasterCommand: (id: string, runId: string, idempotencyKey: string) =>
    post(`/api/projects/${id}/master-command/apply`, { runId, idempotencyKey }).then(r => json<{ run: MasterCommandRun; chapters: Chapter[] }>(r)),
  dismissMasterCommand: (id: string, runId: string) =>
    fetch(`/api/projects/${id}/master-command`, { method: "DELETE", headers: jsonHeaders, body: JSON.stringify({ runId }) }).then(r => json<{ ok: boolean }>(r)),

  /* Storyboard */
  saveStoryboard: (id: string, storyboard: Pick<Storyboard, "notes" | "strokes">) =>
    put(`/api/projects/${id}/storyboard`, storyboard).then((r) => json<ClientProject>(r)),
  askStoryboardAgent: (id: string, question: string, canvasImageDataUrl?: string) =>
    withAIActivity("Thinking about your storyboard…", "Storyboard reply ready", () => post(`/api/projects/${id}/storyboard/ask`, { question, canvasImageDataUrl }).then((r) => json<{ answer: string; chat: Storyboard["chat"] }>(r))),
};
