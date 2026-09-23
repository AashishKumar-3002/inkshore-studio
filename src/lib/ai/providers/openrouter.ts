import { createOpenAICompatibleProvider } from "./openaiCompatible";

/**
 * OpenRouter — one key, hundreds of models from every major lab, billed
 * through a single account. Model ids are namespaced `vendor/model`.
 *
 * The HTTP-Referer / X-Title headers are OpenRouter's optional attribution
 * pair; they make the app show up by name on the user's OpenRouter activity
 * page instead of as an anonymous caller.
 */
export const openrouterProvider = createOpenAICompatibleProvider({
  id: "openrouter",
  label: "OpenRouter",
  baseURL: "https://openrouter.ai/api/v1",
  defaultModel: "anthropic/claude-sonnet-4.5",
  docsUrl: "https://openrouter.ai/keys",
  keyHint: "Starts with sk-or-",
  defaultHeaders: {
    "HTTP-Referer":
      process.env.OPENROUTER_SITE_URL ||
      "https://github.com/AashishKumar-3002/inkshore-studio",
    "X-Title": process.env.OPENROUTER_SITE_NAME || "Inkshore Studio",
  },
  models: [
    { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", vision: true },
    { id: "anthropic/claude-opus-4.1", label: "Claude Opus 4.1", vision: true },
    { id: "openai/gpt-4.1", label: "GPT-4.1", vision: true },
    { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini", vision: true },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", vision: true },
    { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", vision: true },
    { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    { id: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
    { id: "mistralai/mistral-large", label: "Mistral Large" },
    { id: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B" },
  ],
});
