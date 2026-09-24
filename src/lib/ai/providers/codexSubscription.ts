import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AIProvider } from "../types";
import { isDesktopRuntime } from "./claudeSubscription";

export const codexSubscriptionProvider: AIProvider = {
  id: "codex-subscription",
  label: "Codex subscription (desktop)",
  defaultModel: "default",
  // The subscription CLI accepts an explicit Codex model id. Keep the
  // provider default first, then expose the current and previous Codex model
  // families users may have enabled in their ChatGPT plan.
  models: [
    { id: "default", label: "Codex default model (recommended)" },
    { id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
    { id: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
    { id: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max" },
    { id: "gpt-5.1-codex", label: "GPT-5.1 Codex" },
    { id: "gpt-5-codex", label: "GPT-5 Codex" },
  ],
  docsUrl: "https://learn.chatgpt.com/docs/auth",
  keyHint: "Uses your local Codex ChatGPT sign-in, without an API key",

  async generateChapter({ model, systemPrompt, userPrompt, imageDataUrl, signal, onChunk, outputSchema }) {
    if (!isDesktopRuntime()) {
      throw new Error("Codex subscription mode is only available in the Inkshore desktop app.");
    }
    signal?.throwIfAborted();
    if (imageDataUrl) {
      throw new Error("Codex subscription mode currently supports text only. Use a vision API provider for sketches.");
    }
    const { Codex } = await import("@openai/codex-sdk");
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key, value]) => value !== undefined &&
        !["OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL", "CODEX_ACCESS_TOKEN"].includes(key))
    ) as Record<string, string>;
    const directory = await mkdtemp(path.join(tmpdir(), "inkshore-codex-"));
    try {
      const codex = new Codex({
        env,
        config: {
          forced_login_method: "chatgpt",
          model_provider: "openai",
          developer_instructions: systemPrompt,
          features: { shell_tool: false, unified_exec: false },
        },
        configOverrides: ["mcp_servers={}", "hooks={}"],
      });
      const thread = codex.startThread({
        ...(model !== "default" ? { model } : {}),
        workingDirectory: directory,
        skipGitRepoCheck: true,
        sandboxMode: "read-only",
        approvalPolicy: "never",
        webSearchMode: "disabled",
        networkAccessEnabled: false,
      });
      const { events } = await thread.runStreamed(userPrompt, {
        signal,
        outputSchema: outputSchema ?? {
          type: "object",
          properties: { text: { type: "string", description: "Only the requested final response, without progress commentary or explanations." } },
          required: ["text"],
          additionalProperties: false,
        },
      });
      let finalMessage = "";
      let completed = false;
      for await (const event of events) {
        signal?.throwIfAborted();
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "turn.failed") throw new Error(event.error.message);
        if (event.type === "turn.completed") completed = true;
        // Commentary is also an agent_message. Buffer the last message until
        // the turn succeeds, then validate its structured final response.
        if (event.type === "item.completed" && event.item.type === "agent_message") {
          finalMessage = event.item.text;
        }
      }
      if (!completed || !finalMessage.trim()) throw new Error("Codex returned no completed text response.");
      if (outputSchema) {
        JSON.parse(finalMessage);
        onChunk(finalMessage);
        return finalMessage;
      }
      const result = JSON.parse(finalMessage) as { text?: unknown };
      if (typeof result.text !== "string" || !result.text.trim()) throw new Error("Codex returned no valid final text response.");
      onChunk(result.text);
      return result.text;
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error(`Codex subscription request failed: ${error instanceof Error ? error.message : "Unknown error"}. Sign in with npx @openai/codex login; if your plan limit is reached, wait or choose an API provider.`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
};
