import type { AIProviderId } from "@/lib/types";
import type { AIProvider, GenerateChapterRequest } from "../types";

/**
 * Claude via the user's own Claude subscription, through the Agent SDK.
 *
 * This provider only exists in the desktop app. The Agent SDK authenticates
 * against credentials the user has already established on their own machine
 * (`claude login`), so usage draws from *their* Pro/Max limits, not from an
 * API key we hold. That's also why it can't work on the web or on mobile:
 * there is no local process and no local credential store to authenticate
 * against, and routing several users through one subscription is exactly the
 * pooling Anthropic prohibits.
 *
 * The SDK is a heavy, Node-only dependency, so it is imported lazily — a web
 * deployment never loads it, and an install without it degrades to a clear
 * error rather than failing at startup.
 */

/** True when running inside the desktop shell, which sets this. */
export function isDesktopRuntime(): boolean {
  return process.env.INKSHORE_DESKTOP === "1" || process.env.INKDROP_DESKTOP === "1";
}

type TextDelta = { type: "text_delta"; text: string };
type ContentBlockDelta = { type: "content_block_delta"; delta: TextDelta | { type: string } };
type StreamEvent = { type: "stream_event"; event: ContentBlockDelta | { type: string } };

function isTextDelta(event: unknown): event is StreamEvent {
  if (!event || typeof event !== "object") return false;
  const outer = event as StreamEvent;
  if (outer.type !== "stream_event") return false;
  const inner = outer.event as ContentBlockDelta;
  return (
    inner?.type === "content_block_delta" &&
    (inner.delta as TextDelta)?.type === "text_delta" &&
    typeof (inner.delta as TextDelta).text === "string"
  );
}

export const claudeSubscriptionProvider: AIProvider = {
  id: "claude-subscription" as AIProviderId,
  label: "Claude subscription (desktop)",
  defaultModel: "sonnet",
  docsUrl: "https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan",
  keyHint: "No key needed — signs in with your Claude account",
  models: [
    { id: "sonnet", label: "Claude Sonnet", vision: false },
    { id: "opus", label: "Claude Opus", vision: false },
    { id: "haiku", label: "Claude Haiku", vision: false },
  ],

  async generateChapter({
    model,
    systemPrompt,
    userPrompt,
    imageDataUrl,
    signal,
    onChunk,
  }: GenerateChapterRequest): Promise<string> {
    if (!isDesktopRuntime()) {
      throw new Error(
        "Claude subscription mode is only available in the Inkshore desktop app."
      );
    }

    let query: typeof import("@anthropic-ai/claude-agent-sdk").query;
    try {
      ({ query } = await import("@anthropic-ai/claude-agent-sdk"));
    } catch {
      throw new Error(
        "The Claude Agent SDK isn't installed in this build, so subscription mode is unavailable."
      );
    }

    // The Agent SDK is built for agentic work; this is pure text generation,
    // so every capability that could touch the user's machine is switched
    // off: no tools, and no settings sources (which would otherwise pull in
    // their CLAUDE.md and project config and pollute the prompt).
    signal?.throwIfAborted();
    if (imageDataUrl) throw new Error("Claude subscription mode currently supports text only. Use a vision API provider for sketches.");
    const prompt = userPrompt;

    let full = "";
    const run = query({
      prompt,
      options: {
        model,
        systemPrompt: { type: "custom", prompt: systemPrompt },
        includePartialMessages: true,
        maxTurns: 1,
        tools: [],
        allowedTools: [],
        env: { ...process.env, ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: undefined },
        settingSources: [],
      },
    });

    // The SDK has no signal option, so cancellation is cooperative: stop
    // pulling from the iterator and interrupt the underlying session.
    const onAbort = () => {
      void run.interrupt?.().catch(() => {});
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      for await (const message of run) {
        signal?.throwIfAborted();

        if (isTextDelta(message)) {
          const text = ((message.event as ContentBlockDelta).delta as TextDelta).text;
          full += text;
          onChunk(text);
          continue;
        }

        if (message.type === "result") {
          if (message.subtype !== "success") {
            // Usage limits surface here — worth saying plainly, because the
            // fix is "wait or switch provider", not "check your API key".
            throw new Error(
              `Claude subscription request failed (${message.subtype}). ` +
                "If you've hit your plan's usage limit, wait for it to reset or switch to an API key in Settings."
            );
          }
          break;
        }
      }
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }

    signal?.throwIfAborted();
    if (!full.trim()) throw new Error("Claude returned no text response. Check your local Claude sign-in.");
    return full;
  },
};
