"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookText, Plus, Search, Trash2, Upload } from "lucide-react";
import { api, type ProjectSummary } from "@/lib/api";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  Lbl,
  PageHeader,
  Panel,
  Skeleton,
  StatBand,
} from "@/components/ui";

function projectHref(p: { id: string; onboardingComplete: boolean }) {
  return p.onboardingComplete
    ? `/project/${p.id}/chapters`
    : `/project/${p.id}/onboarding`;
}

function formatRelative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DashboardClient() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The effect only starts the request; every setState lands in a promise
  // callback, satisfying React's no-sync-setState-in-effect rule.
  const fetchProjects = useCallback(() => {
    api
      .listProjects()
      .then(setProjects)
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  /** Retry from the error state — a click handler, so setState is fine. */
  const retry = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    fetchProjects();
  }, [fetchProjects]);

  async function createProject() {
    if (creating) return;
    setCreating(true);
    try {
      const project = await api.createProject("Untitled Project");
      router.push(`/project/${project.id}/onboarding`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create that project.");
      setCreating(false);
    }
  }

  async function confirmDelete() {
    const p = pendingDelete;
    if (!p) return;
    setPendingDelete(null);
    const previous = projects;
    setProjects((prev) => prev.filter((x) => x.id !== p.id));
    try {
      await api.deleteProject(p.id);
      toast.success("Project deleted.");
    } catch (e) {
      setProjects(previous);
      toast.error(e instanceof Error ? e.message : "Couldn't delete that project.");
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const data = JSON.parse(await file.text());
      const project = await api.importProject(data);
      toast.success("Project imported.");
      router.push(projectHref(project));
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Couldn't read that file as an Inkshore project."
      );
      setImporting(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const totals = projects.reduce(
    (acc, p) => ({
      words: acc.words + p.wordCount,
      chapters: acc.chapters + p.chapterCount,
    }),
    { words: 0, chapters: 0 }
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.book?.title || "").toLowerCase().includes(q)
    );
  }, [projects, query]);

  return (
    <>
      <PageHeader
        title="Your projects"
        description="Pick up where you left off, or start something new."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              loading={importing}
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </Button>
            <Button onClick={createProject} loading={creating}>
              <Plus className="h-3.5 w-3.5" />
              New project
            </Button>
          </>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportFile(file);
        }}
      />

      {projects.length > 0 && (
        <StatBand
          className="mt-7"
          stats={[
            { value: totals.words.toLocaleString(), label: "Words written" },
            { value: totals.chapters, label: "Chapters" },
            { value: projects.length, label: "Projects" },
            {
              value: projects.filter((p) => p.onboardingComplete).length,
              label: "Bibles complete",
            },
          ]}
        />
      )}

      <section className="mt-7">
        {loading ? (
          <div className="space-y-2" aria-busy>
            <Skeleton className="h-[58px]" />
            <Skeleton className="h-[58px]" />
            <Skeleton className="h-[58px]" />
          </div>
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={retry} />
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<BookText className="h-4 w-4" />}
            title="No projects yet"
            description="Start one and Inkshore walks you through a short questionnaire that becomes the story bible every chapter is written against."
            action={
              <>
                <Button onClick={createProject} loading={creating}>
                  <Plus className="h-3.5 w-3.5" />
                  New project
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  loading={importing}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import a project
                </Button>
              </>
            }
          />
        ) : (
          <>
            {projects.length > 4 && (
              <div className="relative mb-3 max-w-xs">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle"
                  aria-hidden
                />
                <Input
                  className="pl-8"
                  placeholder="Search projects"
                  aria-label="Search projects"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            )}

            <Panel>
              <div className="hidden items-center gap-4 border-b border-hair bg-surface-2/50 px-4 py-2 sm:flex">
                <Lbl className="flex-1">Project</Lbl>
                <Lbl className="w-16 text-right">Chapters</Lbl>
                <Lbl className="w-20 text-right">Words</Lbl>
                <Lbl className="w-24">Status</Lbl>
                <Lbl className="w-16 text-right">Edited</Lbl>
                <span className="w-8" />
              </div>

              {visible.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-ink-muted">
                  No projects match &ldquo;{query}&rdquo;.
                </p>
              ) : (
                visible.map((p) => {
                  const title = p.book?.title || p.name;
                  return (
                    <div
                      key={p.id}
                      className="group flex items-center gap-4 border-b border-hair px-4 py-2.5 transition-colors last:border-b-0 hover:bg-surface-2/60"
                    >
                      <Link href={projectHref(p)} className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">
                          {title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-muted">
                          {p.name !== title && `${p.name} · `}
                          <span className="sm:hidden">
                            {p.chapterCount} ch · {p.wordCount.toLocaleString()} words ·{" "}
                          </span>
                          {formatRelative(p.updatedAt)}
                        </span>
                      </Link>

                      <span className="tnum hidden w-16 text-right text-[13px] text-ink-muted sm:block">
                        {p.chapterCount}
                      </span>
                      <span className="tnum hidden w-20 text-right text-[13px] text-ink-muted sm:block">
                        {p.wordCount > 0 ? p.wordCount.toLocaleString() : "—"}
                      </span>
                      <span className="hidden w-24 sm:block">
                        {p.onboardingComplete ? (
                          <Badge tone="success">Ready</Badge>
                        ) : (
                          <Badge tone="warning">Setup</Badge>
                        )}
                      </span>
                      <span className="tnum hidden w-16 text-right text-xs text-ink-subtle sm:block">
                        {formatRelative(p.updatedAt)}
                      </span>

                      <button
                        aria-label={`Delete ${title}`}
                        title="Delete project"
                        onClick={() => setPendingDelete(p)}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-subtle opacity-0 transition-all hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </Panel>
          </>
        )}
      </section>

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={`Delete “${pendingDelete?.book?.title || pendingDelete?.name}”?`}
        actions={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            {pendingDelete && (
              <a href={`/api/projects/${pendingDelete.id}/export`}>
                <Button variant="secondary">Export first</Button>
              </a>
            )}
            <Button variant="danger" onClick={confirmDelete}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </>
        }
      >
        {pendingDelete && (
          <>
            Its {pendingDelete.chapterCount} chapter
            {pendingDelete.chapterCount === 1 ? "" : "s"},{" "}
            {pendingDelete.wordCount.toLocaleString()} words and the whole story bible
            go with it. This can&rsquo;t be undone.
          </>
        )}
      </Dialog>
    </>
  );
}
