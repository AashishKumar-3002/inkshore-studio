"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Minus, Plus } from "lucide-react";
import { api, ApiError, type ProviderInfo } from "@/lib/api";
import { AIProviderId, ClientProject } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  Lbl,
  PageHeader,
  Select,
  Skeleton,
  Ticks,
} from "@/components/ui";

type SaveStatus = "idle" | "saving" | "saved";

const IMAGE_MODELS = [
  { id: "gpt-image-1", label: "GPT Image 1" },
  { id: "dall-e-3", label: "DALL·E 3" },
];

export default function SettingsPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ClientProject | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");

  // Local, uncommitted text for API-key inputs — never prefilled with the
  // server's masked value, and only sent if the user actually typed something.
  const [aiKeyDraft, setAiKeyDraft] = useState("");
  const [imageKeyDraft, setImageKeyDraft] = useState("");

  const load = useCallback(() => {
    setLoadError(null);
    setProject(null);
    Promise.all([api.getProject(id), api.listProviders()])
      .then(([p, { providers }]) => {
        setProject(p);
        setProviders(providers);
      })
      .catch((e: unknown) =>
        setLoadError(e instanceof Error ? e.message : "Couldn't load settings.")
      );
  }, [id]);

  useEffect(() => {
    // Initial data fetch on mount / id change — load() manages its own
    // loading/error state, there is no way to defer that off the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function flashSaved() {
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1200);
  }

  async function updateAiSettings(
    patch: Partial<{
      provider: AIProviderId;
      model: string;
      fullContextWindow: number;
    }> & { apiKey?: string; apiKeyProvider?: AIProviderId }
  ) {
    if (!project) return;
    setStatus("saving");
    try {
      const updated = await api.saveSettings(id, patch);
      setProject(updated);
      flashSaved();
      toast.success("AI settings saved.");
    } catch (e) {
      setStatus("idle");
      toast.error(e instanceof ApiError ? e.message : "Couldn't save AI settings.");
    }
  }

  async function updateImageSettings(
    patch: Partial<{ provider: "openai"; model: string }> & { apiKey?: string }
  ) {
    if (!project) return;
    setStatus("saving");
    try {
      const updated = await api.saveImageSettings(id, patch);
      setProject(updated);
      flashSaved();
      toast.success("Image settings saved.");
    } catch (e) {
      setStatus("idle");
      toast.error(e instanceof ApiError ? e.message : "Couldn't save image settings.");
    }
  }

  async function toggleRollingSummary(enabled: boolean) {
    if (!project) return;
    try {
      const updated = await api.saveRollingSummarySettings(id, { enabled });
      setProject(updated);
      toast.success(enabled ? "Rolling summary enabled." : "Rolling summary disabled.");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't update the rolling summary."
      );
    }
  }

  if (loadError) {
    return (
      <div className="container-app py-8">
        <ErrorState message={loadError} onRetry={load} />
      </div>
    );
  }

  if (!project || !providers) {
    return (
      <div className="container-app space-y-4 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <Skeleton className="mt-2 h-96" />
      </div>
    );
  }

  const { aiSettings, imageSettings, rollingSummary } = project;
  const provider = providers.find((p) => p.id === aiSettings.provider) ?? providers[0];
  const keySaved = Boolean(aiSettings.configuredKeys[aiSettings.provider]);
  const imageKeySaved = imageSettings.hasApiKey;
  const visionModels = provider.models.filter((m) => m.vision).map((m) => m.label);

  return (
    <div className="container-app py-8">
      <PageHeader
        kicker="Per project · keys never leave your workspace"
        title="Settings"
        actions={
          <span className="text-xs text-ink-subtle" aria-live="polite">
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
          </span>
        }
      />

      <div className="mt-7 flex flex-col gap-6">
        <Card>
          <CardHeader
            title="Text generation"
            description="Provider, model, and the key used to draft your chapters."
          />
          <div className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2">
            <Field label="Provider" htmlFor="ai-provider">
              <Select
                id="ai-provider"
                value={aiSettings.provider}
                onChange={(e) => {
                  const nextId = e.target.value as AIProviderId;
                  const next = providers.find((p) => p.id === nextId);
                  updateAiSettings({
                    provider: nextId,
                    model: next?.defaultModel ?? aiSettings.model,
                  });
                }}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Model" htmlFor="ai-model">
              <Select
                id="ai-model"
                value={aiSettings.model}
                onChange={(e) => updateAiSettings({ model: e.target.value })}
              >
                {provider.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.vision ? " (vision)" : ""}
                  </option>
                ))}
              </Select>
              {provider.models.some((m) => m.vision) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                  <Badge tone="accent">Vision</Badge>
                  <span className="text-xs text-ink-subtle">
                    The storyboard sketch feature needs a vision-capable model
                    {visionModels.length > 0 && ` (e.g. ${visionModels.join(", ")})`}.
                  </span>
                </div>
              )}
            </Field>

            {provider.usesSubscription ? (
              <div className="sm:col-span-2 rounded-lg border border-accent-border bg-accent-soft p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">No API key needed</Badge>
                  <span className="text-[13px] font-medium text-ink">
                    Uses your local subscription sign-in
                  </span>
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  Generation uses your {provider.id === "codex-subscription" ? "Codex / ChatGPT" : "Claude"} account on this computer and counts toward your plan’s usage limits.
                  Sign in once in a terminal with{" "}
                  <code className="rounded bg-surface-2 px-1 py-0.5">
                    {provider.id === "codex-subscription" ? "npx @openai/codex login" : "claude auth login"}
                  </code>. Choose subscription sign-in rather than an API key. Text generation is supported; sketches and cover images need an API provider.

                </p>
                {provider.docsUrl && (
                  <a
                    href={provider.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex w-fit items-center gap-1 text-xs text-accent hover:underline"
                  >
                    How subscription usage works <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ) : (
            <Field
              label={`${provider.label} API key`}
              htmlFor="ai-key"
              className="sm:col-span-2"
              hint={
                <span className="flex flex-col gap-1">
                  <span>
                    {provider.keyHint ??
                      `Stored encrypted on the server. Leave blank to fall back to ${provider.envVar} on the server.`}
                  </span>
                  {provider.docsUrl && (
                    <a
                      href={provider.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center gap-1 text-accent hover:underline"
                    >
                      Get a key <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </span>
              }
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="ai-key"
                  type="password"
                  className="flex-1"
                  autoComplete="off"
                  placeholder={keySaved ? "••••••••" : `Paste your ${provider.label} key`}
                  value={aiKeyDraft}
                  onChange={(e) => setAiKeyDraft(e.target.value)}
                />
                {keySaved && <Badge tone="accent">Key saved</Badge>}
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!aiKeyDraft.trim()}
                  onClick={async () => {
                    await updateAiSettings({
                      apiKey: aiKeyDraft.trim(),
                      apiKeyProvider: aiSettings.provider,
                    });
                    setAiKeyDraft("");
                  }}
                >
                  {keySaved ? "Replace key" : "Save key"}
                </Button>
                {keySaved && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      updateAiSettings({
                        apiKey: "",
                        apiKeyProvider: aiSettings.provider,
                      })
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
            </Field>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Full-text context window"
            description="Recent chapters sent verbatim when generating. Older chapters fold into the hidden story-so-far summary instead."
          />
          <div className="p-5">
            <div className="flex items-center gap-4">
              <Button
                variant="secondary"
                size="icon"
                aria-label="Decrease context window"
                disabled={aiSettings.fullContextWindow <= 1}
                onClick={() =>
                  updateAiSettings({
                    fullContextWindow: Math.max(1, aiSettings.fullContextWindow - 1),
                  })
                }
              >
                <Minus className="h-4 w-4" aria-hidden />
              </Button>
              <span className="disp tnum w-8 text-center text-2xl" aria-hidden>
                {aiSettings.fullContextWindow}
              </span>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Increase context window"
                disabled={aiSettings.fullContextWindow >= 10}
                onClick={() =>
                  updateAiSettings({
                    fullContextWindow: Math.min(10, aiSettings.fullContextWindow + 1),
                  })
                }
              >
                <Plus className="h-4 w-4" aria-hidden />
              </Button>
              <label htmlFor="context-window" className="sr-only">
                Full-text context window
              </label>
              <input
                id="context-window"
                type="number"
                min={1}
                max={10}
                value={aiSettings.fullContextWindow}
                onChange={(e) =>
                  updateAiSettings({ fullContextWindow: Number(e.target.value) || 1 })
                }
                className="sr-only"
              />
              <Ticks
                className="max-w-[220px] flex-1"
                value={aiSettings.fullContextWindow / 10}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Hidden story-so-far summary"
            description="A running continuity note used for chapters outside the full-text window."
          />
          <div className="space-y-3 p-5">
            <label className="flex items-start gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={rollingSummary.enabled}
                onChange={(e) => toggleRollingSummary(e.target.checked)}
              />
              Keep an automatic running summary of every chapter, and use it for
              continuity on chapters outside the full-text window
            </label>
            <p className="text-xs text-ink-subtle">
              After each successful generation, Inkshore asks the model for a short
              continuity note (characters, what changed) and appends it here. It never
              shows up in your chapters — it&rsquo;s only used as background context
              for ideation.
            </p>
            {rollingSummary.entries.length > 0 && (
              <details className="rounded-lg border border-line bg-surface-2 p-3 text-xs text-ink-muted">
                <summary className="cursor-pointer font-medium text-ink">
                  View the log ({rollingSummary.entries.length} entries)
                </summary>
                <ul className="mt-2 space-y-2">
                  {rollingSummary.entries.map((e) => (
                    <li key={e.chapterId}>
                      <span className="font-medium text-ink">
                        {e.chapterTitle}:
                      </span>{" "}
                      {e.summary}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Cover art & images"
            description="Model and key used to generate cover art. Cover generation always goes through OpenAI Images — Claude doesn't currently offer an image generation API."
          />
          <div className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2">
            <Field label="Image model" htmlFor="image-model">
              <Select
                id="image-model"
                value={imageSettings.model}
                onChange={(e) => updateImageSettings({ model: e.target.value })}
              >
                {IMAGE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="OpenAI API key"
              htmlFor="image-key"
              hint="Stored encrypted on the server. Falls back to OPENAI_API_KEY if left blank."
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="image-key"
                  type="password"
                  className="flex-1"
                  autoComplete="off"
                  placeholder={imageKeySaved ? "••••••••" : "Paste your OpenAI key"}
                  value={imageKeyDraft}
                  onChange={(e) => setImageKeyDraft(e.target.value)}
                />
                {imageKeySaved && <Badge tone="accent">Key saved</Badge>}
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!imageKeyDraft.trim()}
                  onClick={async () => {
                    await updateImageSettings({ apiKey: imageKeyDraft.trim() });
                    setImageKeyDraft("");
                  }}
                >
                  {imageKeySaved ? "Replace key" : "Save key"}
                </Button>
                {imageKeySaved && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => updateImageSettings({ apiKey: "" })}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Project" description="Export a portable copy of this project." />
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0">
              <Lbl className="mb-1 block">Export project file</Lbl>
              <p className="text-[13px] text-ink-muted">
                Portable <span className="mono">.inkshore.json</span> — bible, chapters
                and board. Older Inkdrop exports remain importable. API keys are not included.
              </p>
            </div>
            <a href={`/api/projects/${id}/export`}>
              <Button variant="secondary" size="sm">
                Export
              </Button>
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
