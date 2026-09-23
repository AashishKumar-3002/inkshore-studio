import { afterEach, describe, expect, it, vi } from "vitest";
import { codexSubscriptionProvider } from "@/lib/ai/providers/codexSubscription";

const mocks = vi.hoisted(() => ({ run: vi.fn(), start: vi.fn(), options: vi.fn() }));
vi.mock("@openai/codex-sdk", () => ({
  Codex: class {
    constructor(options: unknown) { mocks.options(options); }
    startThread(options: unknown) { mocks.start(options); return { runStreamed: mocks.run }; }
  },
}));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
const request = () => ({ apiKey: "subscription", model: "default", systemPrompt: "Write prose", userPrompt: "A quiet morning", onChunk: vi.fn() });

describe("Codex generation", () => {
  it("rejects hosted execution before loading a runtime", async () => {
    vi.stubEnv("INKSHORE_DESKTOP", "");
    vi.stubEnv("INKDROP_DESKTOP", "");
    await expect(codexSubscriptionProvider.generateChapter(request())).rejects.toThrow("desktop");
    expect(mocks.options).not.toHaveBeenCalled();
  });
  it("uses subscription authentication and emits completed snapshots once", async () => {
    vi.stubEnv("INKSHORE_DESKTOP", "1");
    vi.stubEnv("OPENAI_API_KEY", "must-not-use");
    mocks.run.mockResolvedValue({ events: (async function* () {
      yield { type: "item.updated", item: { type: "agent_message", text: "Morning" } };
      yield { type: "item.completed", item: { type: "agent_message", text: "I will revise the chapter." } };
      yield { type: "item.completed", item: { type: "agent_message", text: JSON.stringify({ text: "Morning arrived." }) } };
      yield { type: "turn.completed" };
    })() });
    const req = request();
    expect(await codexSubscriptionProvider.generateChapter(req)).toBe("Morning arrived.");
    expect(req.onChunk).toHaveBeenCalledExactlyOnceWith("Morning arrived.");
    const options = mocks.options.mock.calls[0][0];
    expect(options.env.OPENAI_API_KEY).toBeUndefined();
    expect(options.config.forced_login_method).toBe("chatgpt");
    expect(mocks.start.mock.calls[0][0].sandboxMode).toBe("read-only");
  });
  it("uses a native report schema without wrapping it in a text property", async () => {
    vi.stubEnv("INKSHORE_DESKTOP", "1");
    const outputSchema = { type: "object", properties: { assessment: { type: "string" } }, required: ["assessment"], additionalProperties: false };
    const response = JSON.stringify({ assessment: "A quiet chapter" });
    mocks.run.mockResolvedValue({ events: (async function* () {
      yield { type: "item.completed", item: { type: "agent_message", text: response } };
      yield { type: "turn.completed" };
    })() });
    expect(await codexSubscriptionProvider.generateChapter({ ...request(), outputSchema })).toBe(response);
    expect(mocks.run.mock.calls[0][1].outputSchema).toEqual(outputSchema);
  });
  it("rejects a failed turn instead of returning partial text", async () => {
    vi.stubEnv("INKSHORE_DESKTOP", "1");
    mocks.run.mockResolvedValue({ events: (async function* () {
      yield { type: "item.completed", item: { type: "agent_message", text: "I will write the chapter." } };
      yield { type: "turn.failed", error: { message: "Usage limit reached" } };
    })() });
    const req = request();
    await expect(codexSubscriptionProvider.generateChapter(req)).rejects.toThrow("Usage limit");
    expect(req.onChunk).not.toHaveBeenCalled();
  });
  it("does not start a cancelled request", async () => {
    vi.stubEnv("INKSHORE_DESKTOP", "1");
    await expect(codexSubscriptionProvider.generateChapter({ ...request(), signal: AbortSignal.abort() })).rejects.toThrow();
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
