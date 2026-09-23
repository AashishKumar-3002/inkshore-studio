"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Sparkles, Wand2, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { BookMeta, ClientProject } from "@/lib/types";
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Kicker,
  Lbl,
  PageHeader,
  Panel,
  Skeleton,
  Textarea,
  cn,
} from "@/components/ui";

type SaveStatus = "idle" | "saving" | "saved";
type ExportFormat = "epub" | "pdf" | "md";

const EXPORT_FORMATS: { format: ExportFormat; label: string; description: string }[] = [
  { format: "epub", label: "EPUB", description: "For e-readers — includes the cover image." },
  { format: "pdf", label: "PDF", description: "Print-ready, with your title page and cover." },
  { format: "md", label: "Markdown", description: "Plain chapter text, good for editing elsewhere." },
];

export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ClientProject | null>(null);
  const [book, setBook] = useState<BookMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");

  const [vision, setVision] = useState("");
  const [directions, setDirections] = useState<string[]>([]);
  const [chosenPrompt, setChosenPrompt] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const [onlyFinal, setOnlyFinal] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    setProject(null);
    api
      .getProject(id)
      .then((p) => {
        setProject(p);
        setBook(p.book);
      })
      .catch((e: unknown) =>
        setLoadError(e instanceof Error ? e.message : "Couldn't load this book.")
      );
  }, [id]);

  useEffect(() => {
    // Initial data fetch on mount / id change — load() manages its own
    // loading/error state, there is no way to defer that off the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function saveBook(patch: Partial<BookMeta>) {
    if (!book) return;
    const previous = book;
    setBook({ ...book, ...patch });
    setStatus("saving");
    try {
      const updated = await api.saveBook(id, patch);
      setProject(updated);
      setBook(updated.book);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1000);
    } catch (e) {
      setBook(previous);
      setStatus("idle");
      toast.error(e instanceof ApiError ? e.message : "Couldn't save that change.");
    }
  }

  async function getSuggestions() {
    setSuggesting(true);
    setCoverError(null);
    try {
      const { directions } = await api.suggestCoverDirections(id, vision);
      setDirections(directions);
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "Couldn't get cover suggestions.";
      setCoverError(message);
      toast.error(message);
    } finally {
      setSuggesting(false);
    }
  }

  async function generateCover(prompt: string) {
    setGenerating(true);
    setCoverError(null);
    try {
      const { imageDataUrl } = await api.generateCover(id, prompt);
      await saveBook({ coverImageDataUrl: imageDataUrl });
      toast.success("Cover generated.");
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Couldn't generate a cover image.";
      setCoverError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }

  if (loadError) {
    return (
      <div className="container-app py-8">
        <ErrorState message={loadError} onRetry={load} />
      </div>
    );
  }

  if (!project || !book) {
    return (
      <div className="container-app space-y-4 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <Skeleton className="mt-2 h-96" />
      </div>
    );
  }

  const readyToExport = project.chapters.some((c) => c.content.trim());
  const missingTitle = !book.title.trim();
  const needsImageKey = !project.imageSettings.hasApiKey;

  const totalWords = project.chapters.reduce((sum, c) => sum + c.wordCount, 0);
  const finalCount = project.chapters.filter((c) => c.status === "final").length;
  const draftedCount = project.chapters.filter((c) => c.status === "drafted").length;
  const estimatedPages = Math.max(1, Math.round(totalWords / 250));

  return (
    <div className="container-app py-8">
      <PageHeader
        kicker={book.title || project.name}
        title="Book & Cover"
        description={`${project.chapters.length} chapter${project.chapters.length === 1 ? "" : "s"} · ${totalWords.toLocaleString()} words · ${finalCount} marked final`}
        actions={
          <span className="text-xs text-ink-subtle" aria-live="polite">
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
          </span>
        }
      />

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        {/* ---------------------------------------------------------- */}
        {/* Left: title page, cover studio, export                     */}
        {/* ---------------------------------------------------------- */}
        <div className="min-w-0">
          <Card className="p-5">
            <Kicker className="mb-4">Title page</Kicker>
            <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <Field label="Book title" htmlFor="book-title" required={missingTitle}>
                <Input
                  id="book-title"
                  placeholder={project.name}
                  defaultValue={book.title}
                  onBlur={(e) => saveBook({ title: e.target.value })}
                />
              </Field>
              <Field label="Subtitle" htmlFor="book-subtitle">
                <Input
                  id="book-subtitle"
                  defaultValue={book.subtitle}
                  onBlur={(e) => saveBook({ subtitle: e.target.value })}
                />
              </Field>
              <Field label="Author" htmlFor="book-author">
                <Input
                  id="book-author"
                  defaultValue={book.author}
                  onBlur={(e) => saveBook({ author: e.target.value })}
                />
              </Field>
            </div>
          </Card>

          <Card className="mt-6 p-5">
            <Kicker className="mb-4">Art direction — drawn from your story</Kicker>
            <div className="space-y-4">
              {book.coverImageDataUrl ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  {/* A generated data: URL — next/image can't optimize that anyway. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={book.coverImageDataUrl}
                    alt={`Cover art for ${book.title || project.name}`}
                    className="h-56 w-auto max-w-full rounded-lg border border-line object-cover shadow-card"
                  />
                  <div className="flex flex-col justify-between gap-2 text-xs text-ink-muted">
                    <p>This is set as your book&rsquo;s cover.</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit text-danger hover:text-danger"
                      onClick={() => saveBook({ coverImageDataUrl: "" })}
                    >
                      <X className="h-3.5 w-3.5" />
                      Remove cover
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-ink-subtle">No cover set yet.</p>
              )}

              {needsImageKey && (
                <p className="rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-[13px] text-warning">
                  No OpenAI key configured for image generation yet. Add one under{" "}
                  <Link href={`/project/${id}/settings`} className="underline underline-offset-2">
                    Settings → Cover art / image generation
                  </Link>{" "}
                  before generating a cover.
                </p>
              )}

              <Field label="Describe your vision for the cover" htmlFor="cover-vision">
                <Textarea
                  id="cover-vision"
                  rows={2}
                  placeholder="e.g. moody, a single figure walking away from a burning house, cold blues... or leave blank and let Inkshore suggest directions from your story."
                  value={vision}
                  onChange={(e) => setVision(e.target.value)}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={getSuggestions}
                  loading={suggesting}
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Get cover direction recommendations
                </Button>
              </Field>

              {directions.length > 0 && (
                <div role="radiogroup" aria-label="Cover directions" className="grid gap-2">
                  {directions.map((d, i) => {
                    const active = chosenPrompt === d;
                    return (
                      <button
                        key={i}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setChosenPrompt(d)}
                        className={cn(
                          "rounded-lg border p-3 text-left text-[13px] transition-colors",
                          active
                            ? "border-accent bg-accent-soft text-ink"
                            : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
                        )}
                      >
                        <span className="mr-1.5 text-ink-subtle">{i + 1}.</span>
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}

              <Field
                label="Final image prompt"
                htmlFor="cover-prompt"
                hint="Uses the image provider configured in Settings (OpenAI Images today — Claude doesn't generate images). Generating an image can take about 30 seconds."
              >
                <Textarea
                  id="cover-prompt"
                  rows={3}
                  placeholder="Pick a direction above, or write your own final prompt for the image model."
                  value={chosenPrompt}
                  onChange={(e) => setChosenPrompt(e.target.value)}
                />
                <Button
                  className="mt-2"
                  onClick={() => generateCover(chosenPrompt)}
                  disabled={!chosenPrompt.trim() || needsImageKey}
                  loading={generating}
                >
                  <Wand2 className="h-4 w-4" aria-hidden />
                  {generating ? "Generating (about 30s)…" : "Generate cover image"}
                </Button>
              </Field>

              {coverError && (
                <p className="text-[13px] text-danger" role="alert">
                  {coverError}
                </p>
              )}
            </div>
          </Card>

          <div className="mt-7">
            <Kicker className="mb-4">Export</Kicker>
            {!readyToExport ? (
              <p className="text-[13px] text-ink-subtle">
                Write or generate at least one chapter before exporting.
              </p>
            ) : (
              <>
                {missingTitle && (
                  <p className="mb-3 rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-[13px] text-warning">
                    No book title set yet — the project name (&ldquo;{project.name}
                    &rdquo;) will be used instead. Set a title above for a proper cover
                    page.
                  </p>
                )}
                {!book.coverImageDataUrl && (
                  <p className="mb-3 text-[13px] text-ink-subtle">
                    No cover set — the export will not include one. Use Cover Studio
                    above to generate one first, if you&rsquo;d like.
                  </p>
                )}

                <label className="mb-3 flex items-center gap-1.5 text-[13px] text-ink-muted">
                  <input
                    type="checkbox"
                    checked={onlyFinal}
                    onChange={(e) => setOnlyFinal(e.target.checked)}
                  />
                  Only include chapters marked Final
                </label>

                <Panel>
                  {EXPORT_FORMATS.map((f) => (
                    <div
                      key={f.format}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-4 py-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink">{f.label}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">{f.description}</p>
                      </div>
                      <a
                        href={`/api/projects/${id}/book/export?format=${f.format}&onlyFinal=${onlyFinal ? "1" : "0"}`}
                      >
                        <Button variant="secondary" size="sm">
                          Download
                        </Button>
                      </a>
                    </div>
                  ))}
                </Panel>
              </>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------------- */}
        {/* Right: cover preview                                        */}
        {/* ---------------------------------------------------------- */}
        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <Lbl className="mb-3 block">Cover preview</Lbl>
          {book.coverImageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.coverImageDataUrl}
              alt={`Cover art for ${book.title || project.name}`}
              className="aspect-[2/3] w-full rounded-xl border border-line object-cover shadow-card"
            />
          ) : (
            <div
              className="hatch flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-xl border border-line shadow-card"
              aria-hidden
            >
              <span className="text-xs text-ink-subtle">No cover yet</span>
            </div>
          )}

          <div className="mt-4">
            <h3 className="text-[15px] font-semibold leading-snug">{book.title || project.name}</h3>
            <p className="mt-1 text-[13px] text-ink-muted">
              {[book.subtitle, book.author].filter(Boolean).join(" · ") || "No subtitle or author set yet"}
            </p>
          </div>

          <div className="mt-5">
            <Lbl>In this export</Lbl>
            <div className="tnum mt-2 text-[13px]">
              <div className="flex items-center justify-between border-b border-hair py-2">
                <span className="text-ink-muted">Cover image</span>
                <span className="text-ink">{book.coverImageDataUrl ? "Yes" : "No"}</span>
              </div>
              <div className="flex items-center justify-between border-b border-hair py-2">
                <span className="text-ink-muted">Title page</span>
                <span className="text-ink">{missingTitle ? "No" : "Yes"}</span>
              </div>
              <div className="flex items-center justify-between border-b border-hair py-2">
                <span className="text-ink-muted">Chapters final</span>
                <span className="text-ink">{finalCount}</span>
              </div>
              <div className="flex items-center justify-between border-b border-hair py-2">
                <span className="text-ink-muted">Chapters drafted</span>
                <span className="text-ink">{draftedCount}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-ink-muted">Estimated pages</span>
                <span className="text-ink">{estimatedPages}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
