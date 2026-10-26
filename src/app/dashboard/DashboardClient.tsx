"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, BookOpen, BookText, Plus, Search, Trash2, Upload } from "lucide-react";
import { api, type ProjectSummary } from "@/lib/api";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
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
  const featured = query.trim() ? null : visible[0] ?? null;
  const remaining = featured ? visible.slice(1) : visible;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Your library</p>
          <h1 className="font-[family-name:var(--font-manuscript)] text-[clamp(34px,5vw,50px)] leading-tight tracking-[-0.035em] text-ink">Stories in progress</h1>
          <p className="mt-2 text-sm text-ink-muted">A place for every world you are writing.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} loading={importing}>
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>
          <Button onClick={createProject} loading={creating}>
            <Plus className="h-3.5 w-3.5" /> New project
          </Button>
        </div>
      </div>
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

      {projects.length > 0 && <div className="mt-8 grid grid-cols-3 gap-3 border-y border-line py-5 sm:max-w-[620px] sm:gap-8">
        <div><p className="font-[family-name:var(--font-manuscript)] text-2xl text-ink">{projects.length}</p><p className="mt-1 text-xs text-ink-muted">{projects.length === 1 ? "Story" : "Stories"}</p></div>
        <div><p className="font-[family-name:var(--font-manuscript)] text-2xl text-ink">{totals.chapters.toLocaleString()}</p><p className="mt-1 text-xs text-ink-muted">Chapters</p></div>
        <div><p className="font-[family-name:var(--font-manuscript)] text-2xl text-ink">{totals.words.toLocaleString()}</p><p className="mt-1 text-xs text-ink-muted">Words written</p></div>
      </div>}

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
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">{query.trim() ? "Search results" : "Continue your story"}</h2>
              {projects.length > 4 && <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" aria-hidden />
                <Input className="pl-9" placeholder="Search your library" aria-label="Search projects" value={query} onChange={event => setQuery(event.target.value)} />
              </div>}
            </div>

            {visible.length === 0 ? <p className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-sm text-ink-muted">No projects match &ldquo;{query}&rdquo;.</p> : <>
              {featured && <article className="relative grid overflow-hidden rounded-2xl border border-line bg-surface shadow-sm lg:grid-cols-[minmax(0,1fr)_310px]">
                <div className="flex flex-col justify-between gap-8 p-6 sm:p-8">
                  <div>
                    <div className="mb-5 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Badge tone={featured.onboardingComplete ? "success" : "warning"}>{featured.onboardingComplete ? "Ready to write" : "Setup in progress"}</Badge><span className="text-xs text-ink-subtle">Edited {formatRelative(featured.updatedAt)}</span></div><button type="button" aria-label={`Delete ${featured.book?.title || featured.name}`} title="Delete project" onClick={() => setPendingDelete(featured)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" aria-hidden /></button></div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Most recent story</p>
                    <h3 className="max-w-[620px] font-[family-name:var(--font-manuscript)] text-[clamp(28px,4vw,42px)] leading-tight tracking-[-0.03em] text-ink">{featured.book?.title || featured.name}</h3>
                    {featured.book?.title && featured.book.title !== featured.name && <p className="mt-2 text-sm text-ink-muted">{featured.name}</p>}
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-5">
                    <div className="flex items-center gap-5 text-xs text-ink-muted"><span>{featured.chapterCount} chapter{featured.chapterCount === 1 ? "" : "s"}</span><span>{featured.wordCount.toLocaleString()} words</span></div>
                    <Link href={projectHref(featured)} className="inline-flex items-center gap-2 rounded-lg bg-solid px-4 py-2.5 text-sm font-medium text-solid-ink transition-colors hover:bg-solid-hover">{featured.onboardingComplete ? "Open studio" : "Continue setup"}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
                  </div>
                </div>
                <div className="relative hidden min-h-[280px] items-center justify-center overflow-hidden bg-[#214f43] p-10 lg:flex">
                  <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_65%_20%,#a9c9b4,transparent_55%)]" />
                  <div className="relative flex h-[220px] w-[154px] flex-col border border-white/25 bg-[#315f4f] p-5 text-white shadow-lg [box-shadow:10px_15px_0_0_#163c32,14px_19px_28px_#102e28]">
                    <BookOpen className="h-5 w-5 opacity-80" aria-hidden />
                    <span className="mt-auto line-clamp-3 font-[family-name:var(--font-manuscript)] text-xl leading-tight">{featured.book?.title || featured.name}</span>
                    <span className="mt-3 h-px w-9 bg-white/65" />
                  </div>
                </div>
              </article>}

              {remaining.length > 0 && <div className="mt-9">
                <h2 className="mb-4 text-sm font-semibold text-ink">{featured ? "All stories" : `${remaining.length} ${remaining.length === 1 ? "story" : "stories"}`}</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {remaining.map(p => {
                    const title = p.book?.title || p.name;
                    return <article key={p.id} className="group flex min-h-[230px] flex-col rounded-xl border border-line bg-surface p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md">
                      <div className="flex items-start justify-between gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg bg-accent-soft text-accent"><BookText className="h-5 w-5" aria-hidden /></div><button type="button" aria-label={`Delete ${title}`} title="Delete project" onClick={() => setPendingDelete(p)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" aria-hidden /></button></div>
                      <Link href={projectHref(p)} className="mt-5 block flex-1"><h3 className="line-clamp-2 font-[family-name:var(--font-manuscript)] text-[23px] leading-tight text-ink group-hover:text-accent">{title}</h3>{p.book?.title && p.book.title !== p.name && <p className="mt-1 truncate text-xs text-ink-muted">{p.name}</p>}</Link>
                      <div className="mt-6 flex items-center justify-between gap-3 border-t border-hair pt-3 text-xs text-ink-muted"><span>{p.chapterCount} ch · {p.wordCount.toLocaleString()} words</span><span>{formatRelative(p.updatedAt)}</span></div>
                    </article>;
                  })}
                </div>
              </div>}
            </>}
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
