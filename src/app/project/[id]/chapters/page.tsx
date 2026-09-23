"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText,
  LayoutGrid,
  Lock,
  LockOpen,
  Plus,
  Rows3,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Chapter, ChapterStatus } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Kicker,
  Lbl,
  PageHeader,
  Panel,
  Segmented,
  Select,
  Skeleton,
  Textarea,
  Ticks,
  cn,
} from "@/components/ui";

const STATUS_LABEL: Record<ChapterStatus, string> = {
  idea: "Idea only",
  generating: "Generating…",
  drafted: "Drafted",
  final: "Final",
};

const STATUS_TONE: Record<ChapterStatus, "neutral" | "accent" | "success" | "outline"> = {
  idea: "neutral",
  generating: "outline",
  drafted: "neutral",
  final: "accent",
};

type PendingUpload = {
  file: File;
  title: string;
  status: "drafted" | "final";
};

type ViewMode = "list" | "grid";

function titleFromFilename(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

/** A rough sense of how far a still-streaming chapter has gotten, purely for
 *  the decorative tick display — not tied to any target the API returns. */
function progressTicks(wordCount: number): number {
  return Math.min(1, wordCount / 3000);
}

export default function ChaptersPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");

  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [newTitle, setNewTitle] = useState("");
  const [newIdea, setNewIdea] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newStatus, setNewStatus] = useState<"drafted" | "final">("drafted");
  const [creating, setCreating] = useState(false);

  const [showUpload, setShowUpload] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved =
        localStorage.getItem("inkshore:chaptersView") ??
        localStorage.getItem("inkdrop:chaptersView");
    } catch {
      // per-viewer convenience only — ignore if storage is unavailable
    }
    if (saved === "grid" || saved === "list") {
      // Reads a persisted UI preference once on mount, after the initial
      // (SSR-matching) render — an effect is the right tool here, not a
      // lazy useState initializer, since that would run during SSR too and
      // could mismatch the client's localStorage value.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView(saved);
    }
  }, []);

  function setViewMode(v: ViewMode) {
    setView(v);
    try {
      localStorage.setItem("inkshore:chaptersView", v);
    } catch {
      // ignore — per-viewer convenience only
    }
  }

  const load = useCallback(() => {
    api
      .getProject(id)
      .then((p) => setChapters(p.chapters))
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // The effect only kicks off the request; every setState lands in a
  // promise callback, satisfying React's no-sync-setState-in-effect rule.
  useEffect(() => {
    load();
  }, [load]);

  /** Retry from the error state — a click handler, so setState is fine. */
  const retry = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    load();
  }, [load]);

  async function addChapter() {
    if (creating) return;
    setCreating(true);
    try {
      const chapter = await api.createChapter(id, {
        title: newTitle || undefined,
        idea: mode === "ai" ? newIdea : "",
        content: mode === "manual" ? newContent : undefined,
        status: mode === "manual" ? newStatus : "idea",
        mode,
      });
      setChapters((prev) => [...prev, chapter]);
      setNewTitle("");
      setNewIdea("");
      setNewContent("");
      setShowForm(false);
      if (mode === "ai") {
        router.push(`/project/${id}/chapters/${chapter.id}`);
      } else {
        toast.success("Chapter added.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create that chapter.");
    } finally {
      setCreating(false);
    }
  }

  async function removeChapter(chapterId: string) {
    if (!confirm("Delete this chapter?")) return;
    const previous = chapters;
    setChapters((prev) => prev.filter((c) => c.id !== chapterId));
    try {
      await api.deleteChapter(id, chapterId);
      toast.success("Chapter deleted.");
    } catch (e) {
      setChapters(previous);
      if (e instanceof ApiError && e.status === 409) {
        toast.error(e.message);
        load();
      } else {
        toast.error(e instanceof Error ? e.message : "Couldn't delete this chapter.");
      }
    }
  }

  async function toggleLock(chapter: Chapter) {
    try {
      const updated = await api.updateChapter(id, chapter.id, { locked: !chapter.locked });
      setChapters((prev) => prev.map((c) => (c.id === chapter.id ? updated : c)));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error(e.message);
        load();
      } else {
        toast.error(e instanceof Error ? e.message : "Couldn't update that chapter.");
      }
    }
  }

  function queueFiles(files: FileList) {
    const items: PendingUpload[] = Array.from(files).map((file) => ({
      file,
      title: titleFromFilename(file.name),
      status: "drafted",
    }));
    setPending((prev) => [...prev, ...items]);
    setShowUpload(true);
  }

  async function confirmUpload() {
    setUploading(true);
    try {
      const toImport = await Promise.all(
        pending.map(async (item) => ({
          title: item.title || "Untitled chapter",
          content: await item.file.text(),
          status: item.status as ChapterStatus,
        }))
      );
      const { chapters: created } = await api.createChapters(id, toImport);
      setChapters((prev) => [...prev, ...created]);
      setPending([]);
      setShowUpload(false);
      toast.success(
        `Imported ${created.length} chapter${created.length === 1 ? "" : "s"}.`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't import those chapters.");
    } finally {
      setUploading(false);
    }
  }

  const totalWords = chapters.reduce((sum, c) => sum + c.wordCount, 0);
  const lockedCount = chapters.filter((c) => c.locked).length;

  const viewToggle = (
    <Segmented
      name="chapters-view"
      ariaLabel="Chapter view"
      value={view}
      onChange={setViewMode}
      options={[
        {
          value: "list",
          label: (
            <>
              <Rows3 className="h-3.5 w-3.5" aria-hidden />
              List
            </>
          ),
        },
        {
          value: "grid",
          label: (
            <>
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
              Grid
            </>
          ),
        },
      ]}
    />
  );

  const ICON_BTN =
    "grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-subtle opacity-0 transition-all hover:bg-surface-3 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100";
  const ICON_BTN_DANGER =
    "grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-subtle opacity-0 transition-all hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100";

  return (
    <div className="container-app py-8">
      <PageHeader
        title="Chapters"
        description={`${chapters.length} chapter${chapters.length === 1 ? "" : "s"} · ${totalWords.toLocaleString()} words · ${lockedCount} locked`}
        actions={
          <>
            {viewToggle}
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" aria-hidden />
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) queueFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button onClick={() => setShowForm((s) => !s)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New chapter
            </Button>
          </>
        }
      />

      {showUpload && pending.length > 0 && (
        <Card className="mt-6 p-4">
          <Lbl>Set a title and status for each uploaded chapter</Lbl>
          <div className="mt-3">
            {pending.map((item, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 border-t border-hair py-2.5 sm:flex-row sm:items-center"
              >
                <Input
                  className="flex-1"
                  aria-label={`Title for ${item.file.name}`}
                  value={item.title}
                  onChange={(e) =>
                    setPending((prev) =>
                      prev.map((p, idx) => (idx === i ? { ...p, title: e.target.value } : p))
                    )
                  }
                />
                <Select
                  className="w-full sm:w-32"
                  aria-label={`Status for ${item.file.name}`}
                  value={item.status}
                  onChange={(e) =>
                    setPending((prev) =>
                      prev.map((p, idx) =>
                        idx === i ? { ...p, status: e.target.value as "drafted" | "final" } : p
                      )
                    )
                  }
                >
                  <option value="drafted">Draft</option>
                  <option value="final">Final</option>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${item.file.name} from import`}
                  onClick={() => setPending((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setPending([]);
                setShowUpload(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={confirmUpload} loading={uploading}>
              Import {pending.length} chapter{pending.length === 1 ? "" : "s"}
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div
          className={cn(
            "mt-6",
            view === "grid" ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2"
          )}
        >
          <Skeleton className="h-[52px]" />
          <Skeleton className="h-[52px]" />
          <Skeleton className="h-[52px]" />
        </div>
      ) : loadError ? (
        <div className="mt-6">
          <ErrorState message={loadError} onRetry={retry} />
        </div>
      ) : chapters.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<FileText className="h-4 w-4" />}
          kicker="No chapters yet"
          title="Give it one rough idea. Inkshore writes the chapter."
          description={
            <>
              Add a chapter with nothing but a sentence of intent, and it arrives drafted
              in your story&rsquo;s voice &mdash; or upload the chapters you&rsquo;ve
              already written and start from where you actually are.
            </>
          }
          action={
            <>
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                New chapter
              </Button>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" aria-hidden />
                Upload chapters
              </Button>
            </>
          }
        />
      ) : view === "list" ? (
        <Panel className="mt-6">
          <div className="hidden items-center gap-4 border-b border-hair bg-surface-2/50 px-4 py-2 sm:flex">
            <span className="w-6" />
            <Lbl className="flex-1">Chapter</Lbl>
            <Lbl className="w-24">Status</Lbl>
            <Lbl className="w-16 text-right">Words</Lbl>
            <span className="w-16" />
          </div>

          {chapters.map((c) => {
            const generating = c.status === "generating";
            return (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center gap-4 border-b border-hair px-4 py-2.5 transition-colors last:border-b-0",
                  generating ? "bg-accent-soft" : "hover:bg-surface-2/60"
                )}
              >
                <span className="rnum hidden w-6 sm:block">
                  {String(c.index).padStart(2, "0")}
                </span>

                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => router.push(`/project/${id}/chapters/${c.id}`)}
                >
                  <span className="flex items-center gap-1.5">
                    {c.locked && (
                      <Lock className="h-3 w-3 shrink-0 text-ink-subtle" aria-label="Locked" />
                    )}
                    <span
                      className={cn(
                        "truncate text-[13px] font-medium",
                        !c.title.trim() && "text-ink-subtle"
                      )}
                    >
                      {c.title || "Untitled"}
                    </span>
                  </span>
                  {c.idea && (
                    <span className="mt-0.5 block truncate text-xs text-ink-muted">
                      {c.status === "idea" ? `Idea: ${c.idea}` : c.idea}
                    </span>
                  )}
                  {generating && (
                    <Ticks className="mt-1.5 max-w-[200px]" value={progressTicks(c.wordCount)} />
                  )}
                  <span className="mt-1 flex items-center gap-2 sm:hidden">
                    <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                    {c.wordCount > 0 && (
                      <span className="tnum text-xs text-ink-muted">
                        {c.wordCount.toLocaleString()}
                      </span>
                    )}
                  </span>
                </button>

                <span className="hidden w-24 sm:block">
                  <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                </span>
                <span className="tnum hidden w-16 text-right text-[13px] text-ink-muted sm:block">
                  {c.wordCount > 0 ? c.wordCount.toLocaleString() : "—"}
                </span>
                <span className="flex w-16 shrink-0 items-center justify-end gap-1">
                  {c.locked ? (
                    <button
                      aria-label={`Unlock chapter ${c.index}`}
                      title="Unlock chapter"
                      onClick={() => toggleLock(c)}
                      className={ICON_BTN}
                    >
                      <Lock className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : (
                    <>
                      <button
                        aria-label={`Lock chapter ${c.index}`}
                        title="Lock chapter"
                        onClick={() => toggleLock(c)}
                        className={ICON_BTN}
                      >
                        <LockOpen className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        aria-label={`Delete chapter ${c.index}`}
                        onClick={() => removeChapter(c.id)}
                        className={ICON_BTN_DANGER}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </Panel>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {chapters.map((c) => {
            const generating = c.status === "generating";
            return (
              <div
                key={c.id}
                className={cn(
                  "group flex flex-col rounded-xl border border-line bg-surface p-4 shadow-xs transition-colors hover:border-line-strong",
                  generating && "bg-accent-soft"
                )}
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => router.push(`/project/${id}/chapters/${c.id}`)}
                >
                  <div className="flex items-center gap-2">
                    <span className="rnum">{String(c.index).padStart(2, "0")}</span>
                    {c.locked && (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-label="Locked" />
                    )}
                  </div>
                  <h3
                    className={cn(
                      "mt-1.5 truncate text-[14px] font-medium leading-tight",
                      !c.title.trim() && "text-ink-subtle"
                    )}
                  >
                    {c.title || "Untitled"}
                  </h3>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                    {c.wordCount > 0 && (
                      <span className="tnum text-xs text-ink-muted">
                        {c.wordCount.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {generating && <Ticks className="mt-2.5" value={progressTicks(c.wordCount)} />}
                  <p className="mt-2.5 line-clamp-3 text-xs text-ink-subtle">
                    {c.content?.trim() || c.idea || "No content yet."}
                  </p>
                </button>
                <div className="mt-3 flex items-center justify-between border-t border-hair pt-2">
                  <button
                    aria-label={c.locked ? `Unlock chapter ${c.index}` : `Lock chapter ${c.index}`}
                    title={c.locked ? "Unlock chapter" : "Lock chapter"}
                    onClick={() => toggleLock(c)}
                    className="grid h-7 w-7 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-3 hover:text-ink"
                  >
                    {c.locked ? (
                      <Lock className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <LockOpen className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </button>
                  <button
                    aria-label={`Delete chapter ${c.index}`}
                    disabled={c.locked}
                    onClick={() => removeChapter(c.id)}
                    className={cn(ICON_BTN_DANGER, "disabled:pointer-events-none disabled:opacity-0")}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !loadError && (
        <div className="mt-6">
          {showForm ? (
            <Card className="p-4">
              <Kicker className="mb-3">New chapter — {chapters.length + 1}</Kicker>
              <Segmented
                name="new-chapter-mode"
                ariaLabel="How to add this chapter"
                className="mb-4"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "ai", label: "Generate with AI" },
                  { value: "manual", label: "I already have this chapter" },
                ]}
              />
              <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                <Field
                  label={`Title — optional, you can name it later`}
                  htmlFor="new-chapter-title"
                >
                  <Input
                    id="new-chapter-title"
                    placeholder={`Chapter ${chapters.length + 1} title`}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </Field>
                <div className="space-y-3">
                  {mode === "ai" ? (
                    <Field label="What should happen in this chapter?" htmlFor="new-chapter-idea">
                      <Textarea
                        id="new-chapter-idea"
                        rows={3}
                        placeholder="e.g. He finally confronts his brother about the letter, but gets interrupted before he can say why he really came."
                        value={newIdea}
                        onChange={(e) => setNewIdea(e.target.value)}
                      />
                    </Field>
                  ) : (
                    <>
                      <Field label="Chapter text" htmlFor="new-chapter-content">
                        <Textarea
                          id="new-chapter-content"
                          rows={5}
                          placeholder="Paste the chapter text here…"
                          value={newContent}
                          onChange={(e) => setNewContent(e.target.value)}
                        />
                      </Field>
                      <Field label="Status" htmlFor="new-chapter-status" className="max-w-[10rem]">
                        <Select
                          id="new-chapter-status"
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value as "drafted" | "final")}
                        >
                          <option value="drafted">Draft</option>
                          <option value="final">Final</option>
                        </Select>
                      </Field>
                    </>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setShowForm(false)}>
                      Cancel
                    </Button>
                    <Button onClick={addChapter} loading={creating}>
                      Create chapter
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
