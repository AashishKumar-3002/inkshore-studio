import { beforeEach, describe, expect, it } from "vitest";
import {
  PROVIDERS,
  envVarFor,
  getProvider,
  modelSupportsVision,
  providerCatalogue,
  resolveApiKey,
} from "@/lib/ai/providers";
import { encryptSecret } from "@/lib/crypto";
import { AI_PROVIDER_IDS } from "@/lib/types";

beforeEach(() => {
  process.env.ENCRYPTION_KEY = "c".repeat(64);
  for (const id of AI_PROVIDER_IDS) delete process.env[envVarFor(id)];
  // Every test starts as the web build; the desktop-only cases opt in.
  delete process.env.INKSHORE_DESKTOP;
  delete process.env.INKDROP_DESKTOP;
});

/** Runs `fn` as if inside the Electron shell, which sets INKSHORE_DESKTOP=1. */
function onDesktop<T>(fn: () => T): T {
  process.env.INKSHORE_DESKTOP = "1";
  try {
    return fn();
  } finally {
    delete process.env.INKSHORE_DESKTOP;
  }
}

describe("provider registry", () => {
  it("registers every declared provider id, including the new ones", () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual([...AI_PROVIDER_IDS].sort());
  });

  it("gives every provider a default model that exists in its own list", () => {
    for (const provider of Object.values(PROVIDERS)) {
      const ids = provider.models.map((m) => m.id);
      expect(ids, `${provider.id} default model`).toContain(provider.defaultModel);
    }
  });

  it("exposes a serializable catalogue for the settings UI", () => {
    const catalogue = providerCatalogue();
    for (const entry of catalogue) {
      expect(entry.label).toBeTruthy();
      expect(entry.envVar).toMatch(/API_KEY$/);
      expect(entry.models.length).toBeGreaterThan(0);
      expect(entry.usesSubscription).toBe(false);
    }
  });

  it("hides the subscription provider from the web build", () => {
    // It authenticates through the Claude session on the user's own machine,
    // which a server rendering for many users does not have.
    expect(providerCatalogue().map((p) => p.id)).not.toContain("claude-subscription");
  });

  it("offers the subscription provider, keyless, inside the desktop app", () => {
    const entry = onDesktop(() =>
      providerCatalogue().find((p) => p.id === "claude-subscription")
    );
    expect(entry).toBeDefined();
    expect(entry!.usesSubscription).toBe(true);
    // No env var, because there is no key to put in one.
    expect(entry!.envVar).toBe("");
  });

  it("falls back to a known provider for an unrecognised id", () => {
    // @ts-expect-error deliberately passing an invalid id
    expect(getProvider("nope")).toBe(PROVIDERS.anthropic);
  });
});

describe("resolveApiKey", () => {
  it("prefers the project's own encrypted key", () => {
    process.env.OPENROUTER_API_KEY = "env-key";
    const stored = { openrouter: encryptSecret("project-key") };
    expect(resolveApiKey("openrouter", stored)).toBe("project-key");
  });

  it("falls back to the provider's env var", () => {
    process.env.NVIDIA_API_KEY = "nvapi-from-env";
    expect(resolveApiKey("nvidia", {})).toBe("nvapi-from-env");
  });

  it("returns undefined when neither is configured", () => {
    expect(resolveApiKey("openai", {})).toBeUndefined();
  });

  it("does not leak one provider's key to another", () => {
    const stored = { anthropic: encryptSecret("sk-ant-key") };
    expect(resolveApiKey("openai", stored)).toBeUndefined();
  });

  it("falls back to env when a stored key can't be decrypted", () => {
    process.env.OPENAI_API_KEY = "env-key";
    // Ciphertext written under a different key.
    process.env.ENCRYPTION_KEY = "d".repeat(64);
    const stored = { openai: encryptSecret("old") };
    process.env.ENCRYPTION_KEY = "c".repeat(64);
    expect(resolveApiKey("openai", stored)).toBe("env-key");
  });

  it("has nothing to resolve for the subscription provider off-desktop", () => {
    // Callers turn undefined into "no key configured", which is what should
    // happen if a saved project asks for this provider on the web.
    expect(resolveApiKey("claude-subscription", {})).toBeUndefined();
  });

  it("resolves the subscription provider without a key inside the desktop app", () => {
    expect(onDesktop(() => resolveApiKey("claude-subscription", {}))).toBeTruthy();
  });
});

describe("modelSupportsVision", () => {
  it("knows which catalogued models can see images", () => {
    expect(modelSupportsVision("openai", "gpt-4.1")).toBe(true);
    expect(modelSupportsVision("nvidia", "meta/llama-3.2-90b-vision-instruct")).toBe(true);
    expect(modelSupportsVision("nvidia", "deepseek-ai/deepseek-r1")).toBe(false);
  });

  it("gives unknown (user-typed) model ids the benefit of the doubt", () => {
    expect(modelSupportsVision("openrouter", "some/brand-new-model")).toBe(true);
  });
});

 describe("Codex subscription", () => {
  it("is hidden and rejected on hosted builds, even with API keys", () => {
    process.env.OPENAI_API_KEY = "must-not-use";
    expect(providerCatalogue().map(p => p.id)).not.toContain("codex-subscription");
    expect(resolveApiKey("codex-subscription", {})).toBeUndefined();
  });
  it("is available without a key on desktop and declares text-only support", () => {
    expect(onDesktop(() => resolveApiKey("codex-subscription", {}))).toBe("subscription");
    expect(onDesktop(() => providerCatalogue().find(p => p.id === "codex-subscription"))?.usesSubscription).toBe(true);
    expect(modelSupportsVision("codex-subscription", "default")).toBe(false);
  });
});
