"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Upload } from "lucide-react";
import {
  DEEP_DIVE_QUESTIONS,
  ONBOARDING_QUESTIONS,
  SECTION_META,
} from "@/lib/questionnaire";
import { AnswerValue, SECTION_IDS, SectionId, StoryBible } from "@/lib/types";
import QuestionCard, { emptyAnswer } from "@/components/QuestionCard";
import { api } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  Textarea,
} from "@/components/ui";

function isEmpty(answer: AnswerValue | undefined): boolean {
  return !answer || (answer.selected.length === 0 && !answer.custom.trim());
}

export default function BiblePage() {
  const { id } = useParams<{ id: string }>();
  const [bible, setBible] = useState<StoryBible | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<SectionId | null>("feel");
  const [openDeepDive, setOpenDeepDive] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const pendingSave = useRef<Promise<unknown>>(Promise.resolve());
  const loadVersion = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    const version = ++loadVersion.current;
    api
      .getProject(id)
      .then((p) => { if (version === loadVersion.current) setBible(p.storyBible); })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : "Couldn't load this project.");
      });
  }, [id]);

    // The effect only kicks off the request; every setState lands in a
  // promise callback, satisfying React's no-sync-setState-in-effect rule.
  useEffect(() => {
    load();
  }, [load]);

  /** Retry from the error state — a click handler, so setState is fine. */
  const retry = useCallback(() => {
    setLoadError(null);
    setBible(null);
    load();
  }, [load]);

  async function save(next: StoryBible) {
    setBible(next);
    setStatus("saving");
    try {
      const request = pendingSave.current.catch(() => {}).then(() => api.saveBible(id, next));
      pendingSave.current = request;
      await request;
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1200);
    } catch (e) {
      setStatus("idle");
      toast.error(e instanceof Error ? e.message : "Couldn't save your changes.");
    }
  }

  function updateAnswer(section: SectionId, qid: string, value: AnswerValue) {
    if (!bible) return;
    save({
      ...bible,
      [section]: {
        ...bible[section],
        answers: { ...bible[section].answers, [qid]: value },
      },
    });
  }

  function updateNotes(section: SectionId, notes: string) {
    if (!bible) return;
    save({ ...bible, [section]: { ...bible[section], notes } });
  }

  async function runImport() {
    if (!importText.trim() || importing) return;
    ++loadVersion.current;
    setImporting(true);
    try {
      await pendingSave.current;
      const { project, filledCount } = await api.extractBibleFromText(id, importText);
      setBible(project.storyBible);
      if (filledCount > 0) {
        setShowImport(false);
        const changed = SECTION_IDS.find(sid => JSON.stringify(bible?.[sid].answers) !== JSON.stringify(project.storyBible[sid].answers));
        if (changed) { setOpenSection(changed); setOpenDeepDive(prev => ({ ...prev, [changed]: true })); }
        toast.success(
          `Filled in ${filledCount} answer${filledCount === 1 ? "" : "s"} from your notes.`
        );
      } else {
        toast.error(
          "Couldn't confidently map anything from that text onto the questionnaire — you may need to fill more in by hand."
        );
      }
      setImportText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  if (loadError) {
    return (
      <div className="container-app py-8">
        <ErrorState message={loadError} onRetry={retry} />
      </div>
    );
  }

  if (!bible) {
    return (
      <div className="container-app py-8">
        <LoadingState label="Loading your story bible…" />
      </div>
    );
  }

  const missingBySection: Record<SectionId, number> = SECTION_IDS.reduce(
    (acc, sid) => {
      const essentials = ONBOARDING_QUESTIONS.filter((q) => q.section === sid);
      acc[sid] = essentials.filter((q) => isEmpty(bible[sid].answers[q.id])).length;
      return acc;
    },
    {} as Record<SectionId, number>
  );
  const totalMissing = Object.values(missingBySection).reduce((a, b) => a + b, 0);

  return (
    <div className="container-app py-8">
      <PageHeader
        title="Story Bible"
        description={
          <>
            Everything here is used as context whenever a chapter is generated. Edit
            anytime — nothing is locked in.
            {totalMissing > 0 && (
              <span className="ml-1 text-danger">
                {totalMissing} essential question{totalMissing === 1 ? "" : "s"} still
                unanswered.
              </span>
            )}
          </>
        }
        actions={
          <>
            <span
              className="tnum mr-1 text-xs text-ink-subtle"
              role="status"
              aria-live="polite"
            >
              {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload file
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowImport((s) => !s)}
            >
              {showImport ? "Hide" : "Paste text"}
            </Button>
          </>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.txt,text/plain,text/markdown"
        className="hidden"
        aria-label="Upload story bible file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const text = await file.text();
          setImportText(text);
          setShowImport(true);
        }}
      />

      {showImport && (
        <Card className="mt-6 p-5">
          <p className="text-xs text-ink-muted">
            Paste your notes, or upload a story-bible.md / text file — Inkshore will map
            what it can onto the questionnaire below.
          </p>
          <Textarea
            className="mt-3"
            rows={8}
            aria-label="Paste your story bible or notes"
            placeholder="Paste your story bible, notes, or a paragraph describing your novel…"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="mt-3 flex justify-end">
            <Button
              onClick={runImport}
              disabled={!importText.trim()}
              loading={importing}
            >
              Extract answers
            </Button>
          </div>
        </Card>
      )}

      <fieldset disabled={importing} className="min-w-0">
      <Panel className="mt-6">
        {SECTION_IDS.map((sectionId) => {
          const meta = SECTION_META[sectionId];
          const essentials = ONBOARDING_QUESTIONS.filter((q) => q.section === sectionId);
          const deepDive = DEEP_DIVE_QUESTIONS.filter((q) => q.section === sectionId);
          const isOpen = openSection === sectionId;
          const showDeepDive = openDeepDive[sectionId];
          const missing = missingBySection[sectionId];
          const total = essentials.length;
          const answered = total - missing;
          const panelId = `bible-section-${sectionId}`;

          return (
            <div key={sectionId}>
              <button
                onClick={() => setOpenSection(isOpen ? null : sectionId)}
                className="flex w-full items-center justify-between gap-3 border-b border-hair px-4 py-3 text-left transition-colors hover:bg-surface-2/60"
                aria-expanded={isOpen}
                aria-controls={panelId}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">
                    {meta.label}
                  </span>
                  <span className="tnum text-xs text-ink-muted">
                    {answered}/{total}
                  </span>
                  {missing > 0 && <Badge tone="warning">Incomplete</Badge>}
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-ink-subtle transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden
                />
              </button>

              {isOpen && (
                <div id={panelId} className="space-y-6 bg-surface-2/40 p-4">
                  <p className="-mt-2 text-xs text-ink-subtle">{meta.blurb}</p>
                  {essentials.map((q) => (
                    <QuestionCard
                      key={q.id}
                      question={q}
                      value={bible[sectionId].answers[q.id] ?? emptyAnswer()}
                      onChange={(value) => updateAnswer(sectionId, q.id, value)}
                      required={isEmpty(bible[sectionId].answers[q.id])}
                    />
                  ))}

                  <div>
                    <label
                      htmlFor={`${panelId}-notes`}
                      className="mb-1.5 block text-xs text-ink-muted"
                    >
                      Freeform notes for this section
                    </label>
                    <Textarea
                      id={`${panelId}-notes`}
                      rows={3}
                      placeholder="Anything else worth capturing here…"
                      value={bible[sectionId].notes}
                      onChange={(e) => {
                        const notes = e.target.value;
                        setBible(current => current ? { ...current, [sectionId]: { ...current[sectionId], notes } } : current);
                      }}
                      onBlur={(e) => updateNotes(sectionId, e.target.value)}
                    />
                  </div>

                  {deepDive.length > 0 && (
                    <div className="border-t border-hair pt-5">
                      <button
                        onClick={() =>
                          setOpenDeepDive((prev) => ({
                            ...prev,
                            [sectionId]: !prev[sectionId],
                          }))
                        }
                        className="lbl text-accent underline underline-offset-2 hover:text-accent-hover"
                      >
                        {showDeepDive
                          ? "Hide deep-dive questions"
                          : `Go deeper (${deepDive.length} more optional questions)`}
                      </button>
                      {showDeepDive && (
                        <div className="mt-5 space-y-6">
                          {deepDive.map((q) => (
                            <QuestionCard
                              key={q.id}
                              question={q}
                              value={bible[sectionId].answers[q.id] ?? emptyAnswer()}
                              onChange={(value) => updateAnswer(sectionId, q.id, value)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Panel>
      </fieldset>
    </div>
  );
}
