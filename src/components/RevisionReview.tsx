"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, Check, X } from "lucide-react";
import type { TextChange } from "@/lib/chapterAssistant";
import { Badge, Button } from "@/components/ui";

export default function RevisionReview({
  open, changes, accepted, applied, stale, locked, busy, applying, selectionOnly, error,
  onClose, onToggle, onSelectAll, onClear, onApply, onRetry, onDiscard,
}: {
  open: boolean;
  changes: TextChange[];
  accepted: number[];
  applied: number[];
  stale: boolean;
  locked: boolean;
  busy: boolean;
  applying: boolean;
  selectionOnly: boolean;
  error: string | null;
  onClose: () => void;
  onToggle: (index: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onApply: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !applying) closeRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, applying]);

  if (!open) return null;

  const available = changes.filter((_, index) => !applied.includes(index)).length;
  return (
    <div className="fixed inset-0 z-[80] bg-ink/55 p-2 backdrop-blur-sm sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget && !applying) onClose(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="revision-review-title" tabIndex={-1}
        className="mx-auto flex h-full w-full max-w-[1180px] flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-overlay outline-none">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-4 sm:px-8">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Editorial review</p>
            <h2 id="revision-review-title" className="font-[family-name:var(--font-manuscript)] text-2xl text-ink">Review revision</h2>
            <p className="mt-1 text-xs text-ink-muted">{selectionOnly ? "Only the selected passage will change." : "Unselected passages stay as written."}</p>
          </div>
          <Button variant="ghost" size="sm" disabled={applying} onClick={onClose}><X className="h-4 w-4" aria-hidden />Close review</Button>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2/50 px-5 py-3 sm:px-8">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <Badge tone="outline">{changes.length} changed passage{changes.length === 1 ? "" : "s"}</Badge>
            <span>{accepted.length} selected</span>
            {applied.length > 0 && <Badge tone="accent">{applied.length} applied</Badge>}
          </div>
          <div className="flex items-center gap-4 text-xs">
            <button type="button" className="text-accent hover:underline" onClick={onSelectAll}>Select remaining</button>
            <button type="button" className="text-accent hover:underline" onClick={onClear}>Clear selection</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-8">
          {stale && <p role="status" className="rounded-lg border border-warning-border bg-warning-soft p-3 text-xs text-warning">The chapter changed since this suggestion. Request a new revision before applying it.</p>}
          {error && <p role="alert" className="rounded-lg border border-danger/30 p-3 text-xs text-danger">{error}</p>}
          {!changes.length && <p className="rounded-lg border border-line bg-surface p-5 text-sm text-ink-muted">The assistant suggested no text changes.</p>}
          {changes.map((change, index) => {
            const isApplied = applied.includes(index);
            return <section key={index} className="overflow-hidden rounded-lg border border-line bg-surface">
              <label className="flex items-center gap-3 border-b border-line px-4 py-3 text-sm font-medium text-ink">
                <input type="checkbox" checked={accepted.includes(index)} disabled={applying || isApplied || stale || locked}
                  onChange={() => onToggle(index)} className="accent-accent" />
                Passage {index + 1}
                {isApplied && <span className="ml-auto flex items-center gap-1 text-xs font-normal text-accent"><Check className="h-3.5 w-3.5" aria-hidden />Applied</span>}
              </label>
              <div className="grid md:grid-cols-2">
                <div className="border-b border-line px-4 py-4 md:border-b-0 md:border-r">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Original</p>
                  <p className="whitespace-pre-wrap font-[family-name:var(--font-manuscript)] text-[15px] leading-[1.7] text-ink">{change.before || "(Insertion)"}</p>
                </div>
                <div className="bg-accent-soft/50 px-4 py-4">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">Suggested</p>
                  <p className="whitespace-pre-wrap font-[family-name:var(--font-manuscript)] text-[15px] leading-[1.7] text-ink">{change.after || "(Remove this passage)"}</p>
                </div>
              </div>
            </section>;
          })}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-4 sm:px-8">
          <Button size="sm" variant="ghost" disabled={applying} onClick={onClose}><ArrowLeft className="h-3.5 w-3.5" aria-hidden />Back to chapter</Button>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" disabled={applying} onClick={onDiscard}>Discard suggestion</Button>
            <Button size="sm" variant="secondary" disabled={busy || applying || stale || locked} onClick={onRetry}>Try again</Button>
            <Button size="sm" loading={applying} disabled={locked || busy || stale || !accepted.length || !available} onClick={onApply}>Apply {accepted.length} passage{accepted.length === 1 ? "" : "s"}</Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
