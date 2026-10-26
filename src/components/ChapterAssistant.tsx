"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, X, History, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { comparePassages, SCORE_CATEGORIES, type AssistantAction, type AssistantEntry, type TextSelection } from "@/lib/chapterAssistant";
import type { Chapter } from "@/lib/types";
import { Badge, Button, Select, Textarea } from "@/components/ui";
import RevisionReview from "@/components/RevisionReview";

const ACTION_LABELS: Record<AssistantAction, string> = { ask: "Ask", rewrite: "Revise", analyze: "Analyze", humanize: "Humanize" };
const FOCUS_OPTIONS = { dialogue: "Natural dialogue", rhythm: "Sentence rhythm", repetition: "Less repetition", specificity: "Stronger specificity" } as const;
type Focus = keyof typeof FOCUS_OPTIONS;

export default function ChapterAssistant({ projectId, chapterId, open, action, onActionChange, onClose, historyOpen, onHistoryOpenChange, content, selection, onSelectionChange, locked, providerLabel, beforeApply, onApplied, onApplyingChange, onReveal }: {
  projectId: string; chapterId: string; open: boolean; action: AssistantAction; onActionChange: (action: AssistantAction) => void; onClose: () => void;
  historyOpen: boolean; onHistoryOpenChange: (open: boolean) => void;
  content: string; selection: TextSelection | null; onSelectionChange: (selection: TextSelection | null) => void;
  locked: boolean; providerLabel: string; beforeApply: () => Promise<void>; onApplied: (chapter: Chapter) => void; onApplyingChange: (busy: boolean) => void; onReveal: (range: TextSelection) => void;
}) {
  const [instructions, setInstructions] = useState<Record<AssistantAction, string>>({ ask: "", rewrite: "", analyze: "", humanize: "" });
  const instruction = instructions[action];
  function setInstruction(value: string, mode: AssistantAction = action) {
    setInstructions(previous => ({ ...previous, [mode]: value }));
  }
  const [strength, setStrength] = useState<"light" | "balanced" | "substantial">("light");
  const [focus, setFocus] = useState<Focus[]>([]);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AssistantEntry[]>([]);
  const [versionLabel, setVersionLabel] = useState("");
  const [savingVersion, setSavingVersion] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  type ResultView = { entry: AssistantEntry; action: AssistantAction; accepted: number[]; appliedId: string | null };
  const [view, setView] = useState<{ entry: AssistantEntry; action: AssistantAction } | null>(null);
  const [previousViews, setPreviousViews] = useState<ResultView[]>([]);
  const [closedModes, setClosedModes] = useState<Partial<Record<AssistantAction, boolean>>>({});
  // Each mode restores its latest saved result; only an explicit Close hides it.
  const selected = closedModes[action] ? null : view?.action === action ? view.entry : history.find(entry => entry.kind === "result" && entry.payload.action === action) ?? null;
  const [reviewChoices, setReviewChoices] = useState<Record<string, number[]>>({});
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.chapterAssistantHistory(projectId, chapterId).then(entries => {
      if (cancelled) return;
      setHistory(entries);
      // Opening history never changes the current assistant view.
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load history."); });
    return () => { cancelled = true; };
  }, [projectId, chapterId, open]);
  useEffect(() => () => abort.current?.abort(), []);

  const target = selected ? selected.payload.selection ? selected.sourceContent.slice(selected.payload.selection.start, selected.payload.selection.end) : selected.sourceContent : "";
  const changes = useMemo(() => selected?.payload.replacement !== undefined ? comparePassages(target, selected.payload.replacement) : [], [selected, target]);
  const appliedChanges = selected?.payload.appliedChanges ?? [];
  const accepted = selected ? reviewChoices[selected.id] ?? changes.map((_, index) => index).filter(index => !appliedChanges.includes(index)) : [];
  function setAccepted(value: number[] | ((current: number[]) => number[])) {
    if (selected) setReviewChoices(previous => ({ ...previous, [selected.id]: typeof value === "function" ? value(accepted) : value }));
  }
  const stale = selected?.kind === "result" && (selected.payload.appliedContent ?? selected.sourceContent) !== content;
  const selectionText = selection ? content.slice(selection.start, selection.end) : "";
  const isEdit = action === "rewrite" || action === "humanize";

  function closeResult() {
    setReviewOpen(false);
    setClosedModes(current => ({ ...current, [action]: true }));
    setView(null);
    setPreviousViews([]);
    setAppliedId(null);
    setError(null);
  }
  function closeReview() {
    setReviewOpen(false);
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-review-trigger]")?.focus());
  }
  function goBack() {
    const previous = previousViews.at(-1);
    if (!previous) { closeResult(); return; }
    setPreviousViews(current => current.slice(0, -1));
    setView({ entry: previous.entry, action: previous.action });
    setReviewChoices(current => ({ ...current, [previous.entry.id]: previous.accepted }));
    setClosedModes(current => ({ ...current, [previous.action]: false }));
    setAppliedId(previous.appliedId);
    setError(null);
    onActionChange(previous.action);
  }
  function chooseEntry(entry: AssistantEntry, mode: AssistantAction = action) {
    if (selected && selected.id !== entry.id) {
      setPreviousViews(current => [...current, { entry: selected, action, accepted, appliedId }].slice(-20));
    }
    setView({ entry, action: mode });
    setReviewOpen(entry.kind === "result" && entry.payload.replacement !== undefined);
    setClosedModes(current => ({ ...current, [mode]: false }));
    setAppliedId(null);
    onHistoryOpenChange(false);
  }
  async function saveVersion() {
    if (savingVersion || applying || busy) return;
    setSavingVersion(true); setError(null);
    try {
      await beforeApply();
      const entry = await api.saveChapterVersion(projectId, chapterId, content, versionLabel);
      setHistory(previous => [entry, ...previous]);
      setVersionLabel("");
      toast.success("Chapter version saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save this version."); }
    finally { setSavingVersion(false); }
  }
  async function run(retryEntry?: AssistantEntry) {
    if (busy || applying) return;
    setBusy(true); setError(null);
    const controller = new AbortController(); abort.current = controller;
    try {
      const requestAction = retryEntry?.payload.action ?? action;
      const requestSelection = retryEntry ? retryEntry.payload.selection : selection;
      const entry = await api.runChapterAssistant(projectId, chapterId, {
        action: requestAction, content, ...(requestSelection && requestAction !== "analyze" ? { selection: requestSelection } : {}), instruction: retryEntry?.payload.instruction ?? instruction, strength: retryEntry?.payload.strength ?? strength, focus: retryEntry?.payload.focus ?? focus,
      }, controller.signal);
      chooseEntry(entry);
      setHistory(previous => [entry, ...previous]);
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) setError(e instanceof Error ? e.message : "The assistant couldn't complete this request.");
    } finally { setBusy(false); abort.current = null; }
  }
  async function apply(entry: AssistantEntry, passageChoices?: number[]) {
    if (applying || locked) return;
    setApplying(true); onApplyingChange(true); setError(null);
    try {
      await beforeApply();
      const result = await api.applyChapterAssistant(projectId, chapterId, entry.id, content, passageChoices);
      onApplied(result.chapter);
      setAppliedId(entry.id);
      if (entry.kind === "result") {
        const chosen = passageChoices ?? changes.map((_, index) => index);
        const updated = { ...entry, payload: { ...entry.payload, appliedContent: result.chapter.content, appliedChanges: [...new Set([...(entry.payload.appliedChanges ?? []), ...chosen])] } };
        setView({ entry: updated, action });
        setReviewChoices(previous => ({ ...previous, [entry.id]: accepted.filter(index => !chosen.includes(index)) }));
        setHistory(previous => [result.version, ...previous.map(item => item.id === entry.id ? updated : item)]);
      } else setHistory(previous => [result.version, ...previous]);
      toast.success(entry.kind === "version" ? "Version restored. Your previous text is saved." : "Changes applied. Original saved in version history.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't apply changes."); }
    finally { setApplying(false); onApplyingChange(false); }
  }
  async function discard(entry: AssistantEntry) {
    try {
      await api.dismissChapterAssistant(projectId, chapterId, entry.id);
      setHistory(previous => previous.filter(item => item.id !== entry.id));
      closeResult();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't discard this suggestion."); }
  }
  function revealQuote(quote: string, instruction?: string) {
    const start = content.indexOf(quote);
    if (start === -1) { setError("This passage changed. Analyze the current chapter again."); return; }
    const range = { start, end: start + quote.length };
    onSelectionChange(range); onReveal(range);
    if (instruction) { setInstruction(instruction, "rewrite"); onActionChange("rewrite"); }
  }
  const analysis = selected?.payload.analysis;
  const versions = history.filter(entry => entry.kind === "version");
  return (<>
    <aside hidden={!open} aria-label="Chapter assistant" className="w-full shrink-0 border-t border-line bg-surface p-5 lg:w-[320px] lg:border-l lg:border-t-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-accent" />Writing assistant</h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label="Assistant history" aria-expanded={historyOpen} onClick={() => onHistoryOpenChange(!historyOpen)}><History className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="Close chapter assistant" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="Assistant action">
        {(Object.keys(ACTION_LABELS) as AssistantAction[]).map(mode => <Button key={mode} size="sm" variant={action === mode ? "secondary" : "ghost"} disabled={busy || applying} aria-pressed={action === mode} onClick={() => onActionChange(mode)}>{ACTION_LABELS[mode]}</Button>)}
      </div>
      {historyOpen && <div className="mb-4 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-line p-3">
        <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-medium">Saved responses & versions</h3><button type="button" className="text-xs text-accent hover:underline" onClick={() => onHistoryOpenChange(false)}>Back to assistant</button></div>
        <div className="space-y-2 border-b border-line pb-3">
          <label htmlFor="version-label" className="block text-xs text-ink-muted">Name this checkpoint (optional)</label>
          <input id="version-label" value={versionLabel} maxLength={80} onChange={event => setVersionLabel(event.target.value)} placeholder="Before the final edit"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-accent" />
          <Button size="sm" variant="secondary" loading={savingVersion} disabled={busy || applying || savingVersion} onClick={() => void saveVersion()}>Save version</Button>
        </div>
        {!history.length && <p className="text-xs text-ink-muted">Responses and pre-edit versions will appear here.</p>}
        {history.map(entry => <button key={entry.id} type="button" className="block w-full rounded p-2 text-left text-xs hover:bg-surface-2" onClick={() => { chooseEntry(entry, entry.payload.action); onActionChange(entry.payload.action); setInstruction(entry.payload.instruction ?? "", entry.payload.action); onSelectionChange(entry.sourceContent === content ? entry.payload.selection ?? null : null); }}>
          <span className="font-medium">{entry.kind === "version" ? entry.payload.label || "Saved original" : ACTION_LABELS[entry.payload.action]}</span><span className="ml-2 text-ink-muted">{new Date(entry.createdAt).toLocaleString()}</span>
        </button>)}
      </div>}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <Badge tone="outline">{action !== "analyze" && selection ? "Selected passage" : "Whole chapter"}</Badge>
        {action !== "analyze" && selection && <button type="button" className="text-accent hover:underline" onClick={() => onSelectionChange(null)}>Use whole chapter</button>}
        <span>{providerLabel}</span>
      </div>
      {action !== "analyze" && selectionText && <blockquote className="mb-3 max-h-24 overflow-y-auto border-l-2 border-accent-border pl-3 text-xs text-ink-muted whitespace-pre-wrap">{selectionText}</blockquote>}
      {action === "humanize" && <div className="mb-3 space-y-3">
        <label className="block text-xs font-medium">Strength<Select className="mt-1" value={strength} disabled={busy} onChange={e => setStrength(e.target.value as typeof strength)}><option value="light">Light polish</option><option value="balanced">Balanced</option><option value="substantial">Substantial</option></Select></label>
        <fieldset className="space-y-1" disabled={busy}><legend className="mb-1 text-xs font-medium">Focus (optional)</legend>{(Object.keys(FOCUS_OPTIONS) as Focus[]).map(key => <label key={key} className="flex items-center gap-2 text-xs text-ink-muted"><input type="checkbox" checked={focus.includes(key)} onChange={() => setFocus(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])} />{FOCUS_OPTIONS[key]}</label>)}</fieldset>
        <p className="text-xs text-ink-muted">Preserves voice, facts, POV, and tense. Improves natural expression; no detector guarantees.</p>
      </div>}
      {action !== "analyze" && <label className="mb-3 block text-xs font-medium">{action === "ask" ? "Your question" : action === "humanize" ? "Additional guidance (optional)" : "What should change?"}
        <Textarea className="mt-1" rows={3} value={instruction} disabled={busy || applying} onChange={e => setInstruction(e.target.value)} placeholder={action === "ask" ? "Does this dialogue fit her character?" : "Improve the pacing while preserving the events."} />
      </label>}
      {action === "rewrite" && <div className="mb-3 flex flex-wrap gap-1">{["Tighten wording", "Strengthen dialogue", "Improve pacing", "Add sensory detail"].map(label => <button type="button" key={label} disabled={busy || applying} className="rounded-full border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink" onClick={() => setInstruction(label)}>{label}</button>)}</div>}
      {action === "analyze" && <p className="mb-3 text-xs text-ink-muted">Five equally weighted editorial scores, with evidence and priority improvements. Scores are subjective guidance, not a prediction of popularity.</p>}
      {locked && isEdit && <p className="mb-3 text-xs text-warning">Unlock this chapter to request or apply edits. Questions and analysis remain available.</p>}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => run()} loading={busy} disabled={applying || !content.trim() || (locked && isEdit) || ((action === "ask" || action === "rewrite") && !instruction.trim())}>{action === "ask" ? "Ask assistant" : action === "analyze" ? "Analyze chapter" : action === "humanize" ? "Humanize text" : "Prepare revision"}</Button>
        {busy && <Button size="sm" variant="secondary" onClick={() => abort.current?.abort()}>Stop</Button>}
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg border border-danger/30 p-3 text-xs text-danger">{error}</p>}
      {selected && <section aria-label="Assistant result" className="max-h-[65vh] space-y-4 overflow-y-auto border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="ghost" disabled={busy || applying} onClick={goBack}><ArrowLeft className="h-3.5 w-3.5" aria-hidden />{previousViews.length ? "Back to previous view" : "Back to assistant"}</Button>
          <Button size="sm" variant="ghost" disabled={busy || applying} onClick={closeResult}>Close result</Button>
        </div>
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">{selected.kind === "version" ? selected.payload.label || "Saved original" : ACTION_LABELS[selected.payload.action] === "Revise" ? "Suggested revision" : `${ACTION_LABELS[selected.payload.action]} result`}</h3>{(appliedId === selected.id || appliedChanges.length > 0) && <Badge tone="accent">{appliedChanges.length > 0 && appliedChanges.length < changes.length ? "Partially applied" : "Applied"}</Badge>}</div>
        {stale && <p role="status" className="rounded-lg border border-warning-border bg-warning-soft p-3 text-xs text-warning">Chapter changed since this response. {analysis ? "Analyze again for an up-to-date report." : "Request a new revision before applying changes."}</p>}
        {selected.payload.answer && <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{selected.payload.answer}</div>}
        {analysis && <>
          <div className="rounded-lg border border-line bg-surface p-4"><span className="text-3xl font-semibold">{analysis.overall}<span className="text-sm text-ink-muted"> / 100</span></span><p className="mt-2 text-[13px] leading-relaxed">{analysis.assessment}</p></div>
          <div className="space-y-3">{(Object.keys(SCORE_CATEGORIES) as (keyof typeof SCORE_CATEGORIES)[]).map(key => <div key={key}><div className="flex justify-between text-xs font-medium"><span>{SCORE_CATEGORIES[key]}</span><span>{analysis.categories[key].score}/100</span></div><progress aria-label={SCORE_CATEGORIES[key]} className="mt-1 h-1.5 w-full accent-accent" max={100} value={analysis.categories[key].score} /><p className="mt-1 text-xs leading-relaxed text-ink-muted">{analysis.categories[key].explanation}</p></div>)}</div>
          <h4 className="text-xs font-semibold">What works</h4>{analysis.strengths.map((item, index) => <div key={index} className="space-y-2 rounded-lg border border-line p-3"><blockquote className="text-xs italic text-ink-muted">“{item.quote}”</blockquote><p className="text-xs leading-relaxed">{item.comment}</p><button type="button" className="text-xs text-accent hover:underline" onClick={() => revealQuote(item.quote)}>Show passage</button></div>)}
          <h4 className="text-xs font-semibold">Priority improvements</h4>{analysis.improvements.map((item, index) => <div key={index} className="space-y-2 rounded-lg border border-line p-3"><h5 className="text-xs font-medium">{index + 1}. {item.issue}</h5><blockquote className="text-xs italic text-ink-muted">“{item.quote}”</blockquote><p className="text-xs leading-relaxed">{item.suggestion}</p><div className="flex gap-3"><button type="button" className="text-xs text-accent hover:underline" onClick={() => revealQuote(item.quote)}>Show passage</button><button type="button" disabled={locked || busy || applying || !content.includes(item.quote)} className="text-xs text-accent hover:underline disabled:opacity-40" onClick={() => revealQuote(item.quote, item.suggestion)}>Suggest an edit</button></div></div>)}
        </>}
        {selected.kind === "version" && <><p className="text-xs text-ink-muted">Restoring replaces the whole chapter and saves your current text as another version.</p><Textarea readOnly aria-label="Saved version text" rows={10} value={selected.sourceContent} /><Button size="sm" variant="secondary" loading={applying} disabled={locked || busy || selected.sourceContent === content} onClick={() => apply(selected)}>Restore this version</Button></>}
        {selected.payload.replacement !== undefined && <>
          <p className="text-xs text-ink-muted">{changes.length ? `${changes.length} changed passage${changes.length === 1 ? "" : "s"}.` : "The assistant suggested no text changes."} Review the original and suggested text before applying anything.</p>
          <Button size="sm" variant="secondary" data-review-trigger onClick={() => setReviewOpen(true)}>Review revision</Button>
        </>}
      </section>}
      {!!versions.length && <div className="mt-4 border-t border-line pt-3"><button type="button" disabled={locked || applying || busy} className="text-xs text-accent hover:underline disabled:opacity-40" onClick={() => chooseEntry(versions[0])}>Review last original / Undo</button></div>}
    </aside>
    {selected?.kind === "result" && selected.payload.replacement !== undefined && <RevisionReview
      open={reviewOpen && open} changes={changes} accepted={accepted} applied={appliedChanges}
      stale={Boolean(stale)} locked={locked} busy={busy} applying={applying}
      selectionOnly={Boolean(selected.payload.selection)} error={error}
      onClose={closeReview}
      onToggle={index => setAccepted(current => current.includes(index) ? current.filter(value => value !== index) : [...current, index])}
      onSelectAll={() => setAccepted(changes.map((_, index) => index).filter(index => !appliedChanges.includes(index)))}
      onClear={() => setAccepted([])}
      onApply={() => void apply(selected, accepted)}
      onRetry={() => { setReviewOpen(false); void run(selected); }}
      onDiscard={() => void discard(selected)}
    />}
  </>);
}
