"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { History, Mic, Square, Volume2, VolumeX, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { needsConfirmation, type MasterCommandRun } from "@/lib/masterCommand";
import { publishProjectChanged } from "@/lib/projectChanged";
import { speak, speechRecognitionAvailable, speechSynthesisAvailable, startDictation, stopSpeaking, type Dictation } from "@/lib/speech";
import { Badge, Button, Textarea } from "@/components/ui";

const VOICE_KEY = "inkshore:master-command-voice";
const EXAMPLES = [
  "I have an idea for the first four chapters — turn it into a chapter plan.",
  "What do you think the next plot beat should be?",
];

/**
 * Browser-only values are read through useSyncExternalStore rather than an
 * effect: the server renders the "no speech support, voice off" state and
 * React swaps in the real one after hydration, with no mismatch and no
 * cascading render.
 */
const neverChanges = () => () => {};
const serverFalse = () => false;
const voiceListeners = new Set<() => void>();
let voicePreference: boolean | null = null;
function readVoicePreference() {
  if (voicePreference === null) voicePreference = typeof window !== "undefined" && localStorage.getItem(VOICE_KEY) === "on";
  return voicePreference;
}
function writeVoicePreference(next: boolean) {
  voicePreference = next;
  localStorage.setItem(VOICE_KEY, next ? "on" : "off");
  voiceListeners.forEach(listener => listener());
}
function subscribeVoice(listener: () => void) {
  voiceListeners.add(listener);
  return () => { voiceListeners.delete(listener); };
}

/**
 * Project-level command surface. Every write it can produce is a proposal the
 * author confirms; nothing here applies anything on its own.
 */
export default function MasterCommand({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [run, setRun] = useState<MasterCommandRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MasterCommandRun[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const voice = useSyncExternalStore(subscribeVoice, readVoicePreference, serverFalse);
  const canDictate = useSyncExternalStore(neverChanges, speechRecognitionAvailable, serverFalse);
  const canSpeak = useSyncExternalStore(neverChanges, speechSynthesisAvailable, serverFalse);
  const abort = useRef<AbortController | null>(null);
  const dictation = useRef<Dictation | null>(null);
  // One key per run: a confirm that fails mid-flight is retried with the same
  // key, and the server answers the replay instead of applying it twice.
  const keys = useRef(new Map<string, string>());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.masterCommandHistory(projectId)
      .then(entries => { if (!cancelled) setHistory(entries); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load command history."); });
    return () => { cancelled = true; };
  }, [projectId, open]);
  useEffect(() => () => { abort.current?.abort(); dictation.current?.stop(); stopSpeaking(); }, []);

  function toggleVoice() {
    const next = !voice;
    writeVoicePreference(next);
    if (!next) { stopSpeaking(); setSpeaking(false); }
  }
  function readAloud(text: string) {
    if (!canSpeak) return;
    setSpeaking(true);
    speak(text, () => setSpeaking(false));
  }
  function toggleDictation() {
    if (listening) { dictation.current?.stop(); return; }
    setError(null);
    const handle = startDictation({
      onResult: text => setTranscript(text),
      onError: message => { setError(message); setListening(false); dictation.current = null; },
      onEnd: () => { setListening(false); dictation.current = null; },
    });
    if (!handle) return;
    dictation.current = handle;
    setListening(true);
  }

  async function send() {
    if (busy || applying || !transcript.trim()) return;
    dictation.current?.stop();
    stopSpeaking();
    setBusy(true); setError(null);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const result = await api.runMasterCommand(projectId, transcript.trim(), controller.signal);
      setRun(result);
      setHistory(previous => [result, ...previous]);
      setTranscript("");
      if (voice) readAloud(result.payload.reply);
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) setError(e instanceof Error ? e.message : "The assistant couldn't complete this request.");
    } finally { setBusy(false); abort.current = null; }
  }

  async function confirm(entry: MasterCommandRun) {
    if (applying) return;
    setApplying(true); setError(null);
    const key = keys.current.get(entry.id) ?? crypto.randomUUID();
    keys.current.set(entry.id, key);
    try {
      const result = await api.applyMasterCommand(projectId, entry.id, key);
      setRun(result.run);
      setHistory(previous => previous.map(item => (item.id === entry.id ? result.run : item)));
      publishProjectChanged();
      toast.success(result.chapters.length ? `${result.chapters.length} chapter${result.chapters.length === 1 ? "" : "s"} added.` : "Story Bible updated.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't apply that."); }
    finally { setApplying(false); }
  }

  async function dismiss(entry: MasterCommandRun) {
    try {
      await api.dismissMasterCommand(projectId, entry.id);
      setHistory(previous => previous.filter(item => item.id !== entry.id));
      if (run?.id === entry.id) setRun(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't dismiss that."); }
  }

  const pending = run && run.status === "proposed" && needsConfirmation(run.payload);

  return (
    <>
      <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <Wand2 className="h-3.5 w-3.5 text-accent" aria-hidden />
        <span className="hidden sm:inline">Master command</span>
        <span className="sr-only sm:hidden">Master command</span>
      </Button>

      <aside hidden={!open} aria-label="Master command" className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-line bg-paper p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Wand2 className="h-4 w-4 text-accent" aria-hidden />Master command</h2>
          <div className="flex gap-1">
            {canSpeak && (
              <Button variant="ghost" size="icon" aria-pressed={voice} aria-label={voice ? "Turn off spoken replies" : "Turn on spoken replies"} onClick={toggleVoice}>
                {voice ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
            )}
            <Button variant="ghost" size="icon" aria-label="Command history" aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}><History className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" aria-label="Close master command" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
        </div>

        <p className="mb-3 text-xs text-ink-muted">Ask about your book, or describe a change. Anything that writes to your project is shown for confirmation first.</p>

        <label className="mb-2 block text-xs font-medium">
          Your command
          <Textarea className="mt-1" rows={3} value={transcript} disabled={busy} onChange={e => setTranscript(e.target.value)} placeholder="Write the next four chapters as a plan…" />
        </label>
        <div className="mb-3 flex flex-wrap gap-1">
          {EXAMPLES.map(example => (
            <button key={example} type="button" disabled={busy || applying} className="rounded-full border border-line px-2 py-1 text-left text-[11px] text-ink-muted hover:text-ink" onClick={() => setTranscript(example)}>{example}</button>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={send} loading={busy} disabled={applying || !transcript.trim()}>Send</Button>
          {busy && <Button size="sm" variant="secondary" onClick={() => abort.current?.abort()}>Stop</Button>}
          {canDictate && (
            <Button size="sm" variant={listening ? "secondary" : "ghost"} aria-pressed={listening} disabled={busy} onClick={toggleDictation}>
              <Mic className="h-3.5 w-3.5" aria-hidden />{listening ? "Listening — stop" : "Dictate"}
            </Button>
          )}
          {speaking && <Button size="sm" variant="ghost" onClick={() => { stopSpeaking(); setSpeaking(false); }}><Square className="h-3.5 w-3.5" aria-hidden />Stop reading</Button>}
        </div>
        {!canDictate && <p className="mb-4 text-xs text-ink-subtle">Dictation isn&apos;t available in this browser — type your command instead.</p>}

        {error && <p role="alert" className="mb-4 rounded-lg border border-danger/30 p-3 text-xs text-danger">{error}</p>}

        {historyOpen && (
          <div className="mb-4 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-line p-3">
            <h3 className="text-xs font-medium">Past commands</h3>
            {!history.length && <p className="text-xs text-ink-muted">Your commands and proposals will appear here.</p>}
            {history.map(entry => (
              <button key={entry.id} type="button" className="block w-full rounded p-2 text-left text-xs hover:bg-surface-2" onClick={() => { setRun(entry); setHistoryOpen(false); }}>
                <span className="font-medium">{entry.transcript.slice(0, 60)}{entry.transcript.length > 60 ? "…" : ""}</span>
                <span className="ml-2 text-ink-muted">{entry.status === "applied" ? "applied" : new Date(entry.createdAt).toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}

        {run && (
          <section aria-label="Assistant reply" className="space-y-4 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Reply</h3>
              <div className="flex items-center gap-2">
                {run.status === "applied" && <Badge tone="accent">Applied</Badge>}
                {canSpeak && <button type="button" className="text-xs text-accent hover:underline" onClick={() => readAloud(run.payload.reply)}>Read aloud</button>}
              </div>
            </div>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{run.payload.reply}</p>

            {run.payload.previews.map((preview, index) => (
              <div key={index} className="space-y-2 rounded-lg border border-line p-3">
                <h4 className="text-xs font-semibold">{preview.title}</h4>
                {preview.before === undefined ? (
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">{preview.detail}</p>
                ) : (
                  <>
                    {preview.before && <div className="space-y-1 rounded bg-surface-2 p-2"><h5 className="text-[10px] font-medium uppercase text-ink-muted">Existing notes</h5><p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">{preview.before}</p></div>}
                    <div className="space-y-1 rounded bg-accent-soft p-2"><h5 className="text-[10px] font-medium uppercase text-ink-muted">To add</h5><p className="whitespace-pre-wrap text-xs leading-relaxed">{preview.detail}</p></div>
                  </>
                )}
              </div>
            ))}

            {pending && (
              <div className="space-y-2">
                <p className="text-xs text-ink-muted">Nothing has been saved yet. Confirm to apply this to your project.</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" loading={applying} onClick={() => confirm(run)}>Confirm</Button>
                  <Button size="sm" variant="ghost" disabled={applying} onClick={() => dismiss(run)}>Dismiss</Button>
                </div>
              </div>
            )}
            {run.status === "proposed" && !needsConfirmation(run.payload) && <p className="text-xs text-ink-subtle">Nothing to apply — this was an answer.</p>}
          </section>
        )}
      </aside>
    </>
  );
}
