"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  ChevronLeft,
  ChevronRight,
  Download,
  Focus,
  Lock,
  LockOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
} from "lucide-react";
import ChapterAssistant from "@/components/ChapterAssistant";
import type { AssistantAction, TextSelection } from "@/lib/chapterAssistant";
import { api, ApiError } from "@/lib/api";
import { AnswerMap, Chapter, ClientProject, SECTION_IDS } from "@/lib/types";
import {
  Button,
  Field,
  Kicker,
  Lbl,
  LoadingState,
  Panel,
  Textarea,
  Ticks,
  cn,
} from "@/components/ui";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type TabId = "edit" | "preview";
type LocalChapterDraft = {
  title: string;
  idea: string;
  content: string;
  savedAt: number;
};

function readLocalDraft(key: string): LocalChapterDraft | null {
  try {
    const value = localStorage.getItem(key);
    if (!value) return null;
    const draft: unknown = JSON.parse(value);
    if (!draft || typeof draft !== "object") return null;
    const item = draft as Partial<LocalChapterDraft>;
    return typeof item.title === "string" && typeof item.idea === "string" &&
      typeof item.content === "string" && typeof item.savedAt === "number"
      ? item as LocalChapterDraft : null;
  } catch {
    return null;
  }
}

const STATUS_LABEL: Record<Chapter["status"], string> = {
  idea: "Idea only",
  generating: "Generating…",
  drafted: "Drafted",
  final: "Final",
};

/** How many of the story bible's questions have actually been answered —
 *  shown as-is in the "Grounded in" panel, purely informational. */
function answeredCount(answers: AnswerMap): number {
  return Object.values(answers).filter((a) => a.selected.length > 0 || a.custom.trim()).length;
}

export default function ChapterWorkspacePage() {
  const { id, chapterId } = useParams<{ id: string; chapterId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ClientProject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [idea, setIdea] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [tab, setTab] = useState<TabId>("edit");
  const [suggesting, setSuggesting] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [recoveredDraft, setRecoveredDraft] = useState(false);
  const [recoveryCandidate, setRecoveryCandidate] = useState<LocalChapterDraft | null>(null);
  const [assistantAction, setAssistantAction] = useState<AssistantAction>("ask");
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [applying, setApplying] = useState(false);
  const pendingSave = useRef<Promise<Chapter | null>>(Promise.resolve(null));
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const draftKey = `inkshore:draft:${id}:${chapterId}`;

  const chapter = useMemo(
    () => project?.chapters.find((c) => c.id === chapterId) ?? null,
    [project, chapterId]
  );

  const loadChapter = useCallback(() => {
    api
      .getProject(id)
      .then((p) => {
        const c = p.chapters.find((ch) => ch.id === chapterId);
        if (c) {
          const local = readLocalDraft(draftKey);
          const shouldRecover = local && local.savedAt > new Date(c.updatedAt).getTime() &&
            (local.title !== c.title || local.idea !== c.idea || local.content !== c.content);
          const differs = local && (local.title !== c.title || local.idea !== c.idea || local.content !== c.content);
          setProject(p);
          setIdea(shouldRecover ? local.idea : c.idea);
          setTitle(shouldRecover ? local.title : c.title);
          setContent(shouldRecover ? local.content : c.content);
          setRecoveredDraft(Boolean(shouldRecover));
          setRecoveryCandidate(differs && !shouldRecover ? local : null);
        } else {
          setLoadError("This chapter no longer exists.");
        }
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [id, chapterId, draftKey]);

  // The effect only kicks off the request; every setState lands in a promise
  // callback, satisfying React's no-sync-setState-in-effect rule.
  useEffect(() => {
    loadChapter();
  }, [loadChapter]);

  /** Retry from the error state — a click handler, so setState is fine. */
  const retry = useCallback(() => {
    setLoadError(null);
    loadChapter();
  }, [loadChapter]);

  const locked = chapter?.locked ?? false;

  const dirty = useMemo(() => {
    if (!chapter) return false;
    return idea !== chapter.idea || title !== chapter.title || content !== chapter.content;
  }, [chapter, idea, title, content]);

  const saveField = useCallback(async (patch: Partial<Chapter>) => {
    setSaveStatus("saving");
    try {
      const request = pendingSave.current.catch(() => null).then(() => api.updateChapter(id, chapterId, patch));
      pendingSave.current = request;
      const updated = await request;
      setProject((prev) =>
        prev
          ? { ...prev, chapters: prev.chapters.map((c) => (c.id === updated.id ? updated : c)) }
          : prev
      );
      setSaveStatus("saved");
      setRecoveredDraft(false);
      return updated;
    } catch (e) {
      setSaveStatus("error");
      if (e instanceof ApiError && e.status === 409) {
        toast.error(e.message);
        loadChapter();
      } else {
        toast.error(e instanceof Error ? e.message : "Couldn't save that change.");
      }
      return null;
    }
  }, [id, chapterId, loadChapter]);

  // Keep a local recovery copy while edits are pending, then save the whole
  // draft after a short pause. The copy also covers closing the window before
  // the network request finishes.
  useEffect(() => {
    if (!chapter || locked || generating || applying || recoveryCandidate) return;
    try {
      if (dirty) {
        localStorage.setItem(draftKey, JSON.stringify({ title, idea, content, savedAt: Date.now() }));
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch {
      // The server save still works if browser storage is unavailable.
    }
    if (!dirty) return;
    const timer = window.setTimeout(() => { void saveField({ title, idea, content }); }, 800);
    return () => window.clearTimeout(timer);
  }, [chapter, locked, generating, applying, recoveryCandidate, dirty, title, idea, content, draftKey, saveField]);

  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusMode]);

  function openAssistant(action: AssistantAction, wholeChapter = false) {
    if (wholeChapter) setSelection(null);
    setAssistantAction(action);
    setAssistantOpen(true);
  }

  function revealPassage(range: TextSelection) {
    setTab("edit");
    setSelection(range);
    requestAnimationFrame(() => {
      const editor = contentRef.current;
      if (!editor) return;
      editor.focus();
      editor.setSelectionRange(range.start, range.end);
      const fraction = range.start / Math.max(content.length, 1);
      editor.scrollTop = fraction * editor.scrollHeight;
    });
  }

  async function toggleLock() {
    if (!chapter) return;
    try {
      if (!chapter.locked && dirty) {
        const saved = await saveField({ title, idea, content });
        if (!saved) return;
      }
      const updated = await api.updateChapter(id, chapterId, { locked: !chapter.locked });
      setProject((prev) =>
        prev
          ? { ...prev, chapters: prev.chapters.map((c) => (c.id === updated.id ? updated : c)) }
          : prev
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error(e.message);
        loadChapter();
      } else {
        toast.error(e instanceof Error ? e.message : "Couldn't update that chapter.");
      }
    }
  }

  async function generate() {
    if (locked || !chapter) return;
    setGenerating(true);
    // Keep the source visible until replacement prose arrives.
    // persist the idea/title first so the prompt builder sees the latest idea
    try {
      await api.updateChapter(id, chapterId, { idea, title, content });
    } catch (e) {
      setGenerating(false);
      if (e instanceof ApiError && e.status === 409) {
        toast.error(e.message);
        loadChapter();
      } else {
        toast.error(e instanceof Error ? e.message : "Couldn't save before generating.");
      }
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let acc = "";
      await api.generateChapter(
        id,
        chapterId,
        {},
        (chunk) => {
          acc += chunk;
          setContent(acc);
          requestAnimationFrame(() => {
            contentRef.current?.scrollTo(0, contentRef.current.scrollHeight);
          });
        },
        controller.signal
      );
      loadChapter();
    } catch (e) {
      // Whatever streamed so far is already saved server-side on abort — just
      // resync rather than treating a deliberate stop as an error.
      const aborted = e instanceof DOMException && e.name === "AbortError";
      if (!aborted) {
        if (e instanceof ApiError && e.status === 409) {
          toast.error(e.message);
        } else {
          toast.error(e instanceof Error ? e.message : "Generation failed.");
        }
      }
      loadChapter();
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  function stopGenerating() {
    abortRef.current?.abort();
  }

  async function suggestTitle() {
    setSuggesting(true);
    try {
      const { title: suggested } = await api.suggestChapterTitle(id, chapterId);
      setTitle(suggested);
      await saveField({ title: suggested });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error(e.message);
        loadChapter();
      } else {
        toast.error(e instanceof Error ? e.message : "Couldn't suggest a title.");
      }
    } finally {
      setSuggesting(false);
    }
  }

  if (loadError) {
    return (
      <div className="container-app py-8">
        <div
          className="rounded-lg border border-danger-border bg-danger-soft px-4 py-3 text-[13px] text-danger"
          role="alert"
        >
          <p className="font-medium">{loadError}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="ghost" size="sm" onClick={retry}>
              Try again
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/project/${id}/chapters`)}
            >
              Back to chapters
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!chapter || !project) {
    return (
      <div className="container-app py-8">
        <LoadingState label="Loading chapter…" />
      </div>
    );
  }

  const looksUntitled = /^chapter\s+\d+$/i.test(title.trim()) || !title.trim();
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const targetWords = 3000;

  const sortedChapters = [...project.chapters].sort((a, b) => a.index - b.index);
  const posInList = sortedChapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = posInList > 0 ? sortedChapters[posInList - 1] : null;
  const nextChapter =
    posInList >= 0 && posInList < sortedChapters.length - 1 ? sortedChapters[posInList + 1] : null;

  const fullWindow = project.aiSettings.fullContextWindow;
  const priorChapters = sortedChapters.filter((c) => c.index < chapter.index).reverse();
  const bibleAnswers = SECTION_IDS.reduce(
    (sum, s) => sum + answeredCount(project.storyBible[s].answers),
    0
  );

  return (
    <div className={cn("mx-auto w-full max-w-[1600px] px-4 py-6 md:px-7", focusMode && "fixed inset-0 z-[60] max-w-none overflow-y-auto bg-paper md:px-10")}>
      {!focusMode && <Button
        variant="ghost"
        size="sm"
        className="-ml-2 mb-5 text-ink-muted hover:text-ink"
        onClick={() => router.push(`/project/${id}/chapters`)}
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All chapters
      </Button>}

      {focusMode && (
        <div className="mx-auto mb-10 flex max-w-[760px] items-center justify-between border-b border-line pb-4 text-xs text-ink-muted">
          <Button variant="ghost" size="sm" onClick={() => setFocusMode(false)}>← Back to studio</Button>
          <span>{project.name}</span>
          <span aria-live="polite">{saveStatus === "error" ? "Save failed" : dirty ? "Saving draft…" : "All changes saved"}</span>
        </div>
      )}

      <div className={cn("flex flex-wrap items-start justify-between gap-4", focusMode && "mx-auto max-w-[760px]")}>
        <div className="min-w-0 flex-1">
          <Kicker className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
            Chapter {String(chapter.index).padStart(2, "0")} · {STATUS_LABEL[chapter.status]}
          </Kicker>
          <label htmlFor="chapter-title" className="sr-only">
            Chapter title
          </label>
          <input
            id="chapter-title"
            className="w-full min-w-0 border-none bg-transparent p-0 font-[family-name:var(--font-manuscript)] text-[clamp(30px,4vw,42px)] leading-tight tracking-[-0.035em] text-ink focus:outline-none disabled:text-ink-muted"
            value={title}
            disabled={locked || applying}
            onChange={(e) => setTitle(e.target.value)}
          />
          {looksUntitled && !locked ? (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mt-1 text-ink-subtle hover:text-ink"
              onClick={suggestTitle}
              loading={suggesting}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Suggest a title
            </Button>
          ) : null}
          {!focusMode && <span className="mt-2 flex items-center gap-2 text-xs text-ink-muted" aria-live="polite">
            {saveStatus === "error" ? <>
              Couldn’t save · retry before leaving this chapter
              <button type="button" className="font-medium text-accent underline" onClick={() => void saveField({ title, idea, content })}>Retry</button>
            </> : dirty || saveStatus === "saving" ? "Saving draft…" : "All changes saved"}
          </span>}
        </div>
        <div className={cn("flex flex-wrap items-center gap-2", focusMode && "hidden")}>
          <Button
            variant="secondary"
            size="sm"
            onClick={toggleLock}
            disabled={applying}
            aria-label={locked ? "Unlock chapter" : "Lock chapter"}
          >
            {locked ? (
              <Lock className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <LockOpen className="h-3.5 w-3.5" aria-hidden />
            )}
            {locked ? "Unlock" : "Lock"}
          </Button>
          {generating && (
            <Button variant="secondary" size="sm" onClick={stopGenerating}>
              <Ban className="h-3.5 w-3.5" aria-hidden />
              Stop
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => { setTab("edit"); setFocusMode(true); }}>
            <Focus className="h-3.5 w-3.5" aria-hidden /> Focus
          </Button>
          <Button variant={assistantOpen ? "secondary" : "primary"} size="sm" onClick={() => setAssistantOpen(value => !value)}>
            {assistantOpen ? <PanelRightClose className="h-3.5 w-3.5" aria-hidden /> : <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />}
            {assistantOpen ? "Close assistant" : "Ask AI"}
          </Button>
          {!content.trim() && (
            <Button size="sm" onClick={generate} loading={generating} disabled={locked || applying}>
              {generating ? "Writing…" : "Generate chapter"}
            </Button>
          )}
        </div>
      </div>

      {recoveredDraft && <p role="status" className="mt-4 rounded-lg border border-accent-border bg-accent-soft px-4 py-2 text-xs text-accent">Recovered your unsaved local draft. It will save automatically.</p>}
      {recoveryCandidate && <div role="status" className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning-border bg-warning-soft px-4 py-2 text-xs text-warning">
        <span>A local draft differs from the saved chapter.</span>
        <button type="button" className="font-medium underline" onClick={() => {
          setTitle(recoveryCandidate.title);
          setIdea(recoveryCandidate.idea);
          setContent(recoveryCandidate.content);
          setRecoveredDraft(true);
          setRecoveryCandidate(null);
        }}>Restore local draft</button>
        <button type="button" className="underline" onClick={() => { try { localStorage.removeItem(draftKey); } catch {} setRecoveryCandidate(null); }}>Dismiss</button>
      </div>}

      {locked && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning-border bg-warning-soft px-4 py-2.5 text-[13px] text-warning">
          <span className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            This chapter is locked &mdash; earlier changes here won&rsquo;t ripple into
            later chapters by accident.
          </span>
          <Button variant="ghost" size="sm" onClick={toggleLock} className="text-warning hover:text-warning">
            Unlock
          </Button>
        </div>
      )}

      <Panel className={cn("mt-6 flex min-h-[670px] flex-col rounded-lg shadow-none lg:flex-row", focusMode && "mx-auto max-w-[760px] border-0 bg-transparent")}>
        {!focusMode && <nav aria-label="Chapters" className="hidden w-48 shrink-0 border-r border-line bg-surface-2/40 px-3 py-6 xl:block">
          <Lbl className="mb-4 block px-2">Chapters</Lbl>
          {sortedChapters.map(c => (
            <button key={c.id} type="button" onClick={() => router.push(`/project/${id}/chapters/${c.id}`)}
              aria-current={c.id === chapterId ? "page" : undefined}
              className={cn("mb-1 block w-full truncate rounded-lg px-2 py-2 text-left text-xs", c.id === chapterId ? "bg-accent-soft font-medium text-accent" : "text-ink-muted hover:bg-surface-2 hover:text-ink")}
            >{String(c.index).padStart(2, "0")} &nbsp; {c.title || "Untitled"}</button>
          ))}
          <div className="mt-5 border-t border-line px-2 pt-4 text-xs text-ink-subtle">{project.chapters.length} chapters · {project.name}</div>
        </nav>}

        <div className={cn("flex min-w-0 flex-1 flex-col px-5 py-6 md:px-8", focusMode && "px-0 py-0 md:px-0")}>
          {!focusMode && <details className="mb-6 rounded-lg border border-line bg-surface-2/40 px-4 py-3">
            <summary className="text-xs font-medium text-ink">Chapter brief <span className="ml-2 font-normal text-ink-muted">· Story bible and previous chapters</span></summary>
            <div className="mt-4 grid gap-5 border-t border-line pt-4 md:grid-cols-2">
              <Field label="Your idea for this chapter" htmlFor="chapter-idea">
            <Textarea
              id="chapter-idea"
              rows={4}
              disabled={locked || applying}
              placeholder="What must happen in this chapter? Be as specific or as loose as you like — or skip this and just write the chapter yourself below."
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
            />
              </Field>
              <div><Lbl className="mb-1.5 block">Grounded in</Lbl>
            <div className="flex items-center justify-between border-b border-hair py-2 text-[13px]">
              <span className="truncate pr-3">
                Story bible <span className="text-ink-subtle">· {bibleAnswers} answers</span>
              </span>
              <span className="shrink-0 text-xs font-medium text-ink-subtle">FULL</span>
            </div>
            {priorChapters.slice(0, 4).map((c, i) => (
              <div
                key={c.id}
                className={cn(
                  "flex items-center justify-between py-2 text-[13px] text-ink-muted",
                  i < priorChapters.length - 1 && "border-b border-hair"
                )}
              >
                <span className="truncate pr-3">
                  Ch. {String(c.index).padStart(2, "0")} {c.title || "Untitled"}
                </span>
                <span className="shrink-0 text-xs font-medium text-ink-subtle">
                  {i < fullWindow ? "FULL" : "ROLLED"}
                </span>
              </div>
            ))}</div>
            </div>
          </details>}

          {generating && (
            <div className="mb-5">
              <Lbl className="mb-1.5 block">Drafting</Lbl>
              <Ticks value={Math.min(1, wordCount / targetWords)} />
              <p className="mt-2 text-xs text-ink-muted">
                {wordCount.toLocaleString()} / {targetWords.toLocaleString()} words · streaming
              </p>
            </div>
          )}


          {!focusMode && <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lbl id="chapter-text-label">Chapter text</Lbl>
              <div
                role="tablist"
                aria-labelledby="chapter-text-label"
                className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5"
              >
                <button
                  role="tab"
                  id="tab-edit"
                  aria-selected={tab === "edit"}
                  aria-controls="panel-edit"
                  onClick={() => setTab("edit")}
                  className={cn(
                    "rounded-[6px] px-2.5 py-1 text-[13px] transition-colors",
                    tab === "edit"
                      ? "bg-surface font-medium text-ink shadow-xs"
                      : "text-ink-muted hover:text-ink"
                  )}
                >
                  Edit
                </button>
                <button
                  role="tab"
                  id="tab-preview"
                  aria-selected={tab === "preview"}
                  aria-controls="panel-preview"
                  onClick={() => setTab("preview")}
                  className={cn(
                    "rounded-[6px] px-2.5 py-1 text-[13px] transition-colors",
                    tab === "preview"
                      ? "bg-surface font-medium text-ink shadow-xs"
                      : "text-ink-muted hover:text-ink"
                  )}
                >
                  Preview
                </button>
              </div>
            </div>
            <span className="tnum text-xs text-ink-muted" aria-live="polite">
              {generating
                ? "Generating…"
                : `${wordCount.toLocaleString()} words${
                    saveStatus === "saved" ? " · saved" : ""
                  }`}
            </span>
          </div>}

          <div className={cn("mb-3 flex flex-wrap items-center gap-2", focusMode && "hidden")}>
            {selection && tab === "edit" && <div role="toolbar" aria-label="Selected passage actions" className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-1" onMouseDown={e => e.preventDefault()}>
              <span className="mr-1 text-xs text-ink-muted">Selected passage</span>
              <Button variant="ghost" size="sm" disabled={generating || applying} onClick={() => openAssistant("ask")}>Ask about selection</Button>
              <Button variant="ghost" size="sm" disabled={locked || generating || applying} onClick={() => openAssistant("rewrite")}>Rewrite selection</Button>
              <Button variant="ghost" size="sm" disabled={locked || generating || applying} onClick={() => openAssistant("humanize")}>Humanize selection</Button>
            </div>}
          </div>

          {tab === "edit" ? (
            <div id="panel-edit" role="tabpanel" aria-labelledby="tab-edit">
              <label htmlFor="chapter-content" className="sr-only">
                Chapter text
              </label>
              <Textarea
                id="chapter-content"
                ref={contentRef}
                className={cn("min-h-[540px] h-[65vh] resize-none border-0 bg-transparent px-0 font-[family-name:var(--font-manuscript)] text-[17px] leading-[1.8] shadow-none focus:border-0 focus:ring-0", focusMode && "h-[70vh] text-[18px]")}
                value={content}
                readOnly={locked || applying || generating}
                onSelect={e => {
                  const { selectionStart: start, selectionEnd: end } = e.currentTarget;
                  setSelection(start < end ? { start, end } : null);
                }}
                onChange={(e) => { setContent(e.target.value); setSelection(null); }}
                placeholder="Generated (or hand-written) prose will appear here — fully editable. If you already have this chapter written, just paste it in."
              />
            </div>
          ) : (
            <div
              id="panel-preview"
              role="tabpanel"
              aria-labelledby="tab-preview"
              className="prose-manuscript min-h-[540px] h-[65vh] max-w-none overflow-y-auto rounded-lg bg-transparent p-0"
            >
              {content.trim() ? (
                content.split(/\n{2,}/).map((para, i, arr) => (
                  <p key={i} className="whitespace-pre-wrap">
                    {para}
                    {generating && i === arr.length - 1 && <span className="caret" />}
                  </p>
                ))
              ) : (
                <p className="text-ink-subtle">Nothing to preview yet.</p>
              )}
            </div>
          )}

          <div className={cn("mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-hair pt-4", focusMode && "hidden")}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              {prevChapter ? (
                <button
                  onClick={() => router.push(`/project/${id}/chapters/${prevChapter.id}`)}
                  className="flex items-center gap-1 transition-colors hover:text-ink"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  Ch. {String(prevChapter.index).padStart(2, "0")} previous
                </button>
              ) : (
                <span />
              )}
              {prevChapter && nextChapter && <span>·</span>}
              {nextChapter && (
                <button
                  onClick={() => router.push(`/project/${id}/chapters/${nextChapter.id}`)}
                  className="flex items-center gap-1 transition-colors hover:text-ink"
                >
                  Next ch. {String(nextChapter.index).padStart(2, "0")}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
            {generating ? (
              <Button variant="ghost" size="sm" onClick={stopGenerating}>
                Stop generating
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={locked || applying}
                onClick={() => saveField({ title, idea, content, status: "final" })}
              >
                Mark as final
              </Button>
            )}
          </div>
        </div>
        <ChapterAssistant
          key={chapterId}
          projectId={id} chapterId={chapterId} open={assistantOpen && !focusMode} action={assistantAction}
          onActionChange={setAssistantAction} onClose={() => setAssistantOpen(false)}
          content={content} selection={selection} onSelectionChange={setSelection}
          locked={locked} providerLabel={({ anthropic: "Claude", openai: "OpenAI", openrouter: "OpenRouter", nvidia: "NVIDIA NIM", "claude-subscription": "Claude subscription", "codex-subscription": "Codex subscription" })[project.aiSettings.provider]}
          onApplyingChange={setApplying} onReveal={revealPassage}
          beforeApply={async () => {
            await pendingSave.current.catch(() => null);
            if (content !== chapter.content || title !== chapter.title || idea !== chapter.idea) {
              const saved = await saveField({ content, title, idea });
              if (!saved) throw new Error("Save the chapter before applying this suggestion.");
            }
          }}
          onApplied={updated => {
            setContent(updated.content);
            setSelection(null);
            setProject(prev => prev ? { ...prev, chapters: prev.chapters.map(c => c.id === updated.id ? updated : c) } : prev);
            setSaveStatus("saved");
          }}
        />
      </Panel>

      <div className={cn("mt-5 flex flex-wrap items-center gap-2 text-xs text-ink-subtle", focusMode && "hidden")}>
        <span className="flex items-center gap-1">
          <Download className="h-3.5 w-3.5" aria-hidden />
          Export:
        </span>
        {(["md", "pdf", "epub"] as const).map((fmt) => (
          <a
            key={fmt}
            href={`/api/projects/${id}/chapters/${chapterId}/export?format=${fmt}`}
            className="rounded-md border border-line px-2.5 py-1 text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            .{fmt}
          </a>
        ))}
      </div>
    </div>
  );
}
