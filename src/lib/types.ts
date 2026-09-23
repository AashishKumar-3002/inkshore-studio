// Core data model for the Inkshore Studio app.

export type AnswerValue = {
  /** Selected option ids (chips). Empty array if user only wrote custom text. */
  selected: string[];
  /** Free-text "write your own" response. */
  custom: string;
};

export type AnswerMap = Record<string, AnswerValue>;

export interface StoryBibleSection {
  /** Raw answers keyed by question id, from onboarding + deep-dive. */
  answers: AnswerMap;
  /** Freeform notes the user can add anytime for this section. */
  notes: string;
}

export const SECTION_IDS = [
  "feel",
  "philosophy",
  "protagonist",
  "relationships",
  "plot",
  "pacing",
  "world",
  "voice",
  "restraint",
  "structure",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export type StoryBible = {
  [K in SectionId]: StoryBibleSection;
};

export function emptySection(): StoryBibleSection {
  return { answers: {}, notes: "" };
}

export function emptyStoryBible(): StoryBible {
  const bible = {} as StoryBible;
  for (const id of SECTION_IDS) bible[id] = emptySection();
  return bible;
}

export type ChapterStatus = "idea" | "generating" | "drafted" | "final";

export interface Chapter {
  id: string;
  index: number;
  title: string;
  /** The user's own idea for what must happen in this chapter. */
  idea: string;
  /** Generated / hand-written prose. */
  content: string;
  /** Short auto- or user-written summary used as compressed context for later chapters. */
  summary: string;
  status: ChapterStatus;
  wordCount: number;
  /** When true, idea/content/title are protected from edits and regeneration. */
  locked: boolean;
  /** How the author intends to produce this chapter — purely a UI hint. */
  mode: "ai" | "manual";
  createdAt: string;
  updatedAt: string;
}

export const AI_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "openrouter",
  "nvidia",
  /** Desktop only — authenticates with the user's own Claude subscription. */
  "claude-subscription",
  "codex-subscription",
] as const;

export type AIProviderId = (typeof AI_PROVIDER_IDS)[number];

export function isAIProviderId(value: unknown): value is AIProviderId {
  return (
    typeof value === "string" && (AI_PROVIDER_IDS as readonly string[]).includes(value)
  );
}

export interface AISettings {
  provider: AIProviderId;
  model: string;
  /**
   * Per-provider API keys, encrypted at rest (see lib/crypto.ts). Never sent
   * to the browser — the client only ever receives a masked placeholder.
   * Falls back to the matching env var when unset.
   */
  apiKeys: Partial<Record<AIProviderId, string>>;
  /** How many previous chapters to include in full (rest are summarized). */
  fullContextWindow: number;
}

export function defaultAISettings(): AISettings {
  return {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    apiKeys: {},
    fullContextWindow: 2,
  };
}

export type ImageProviderId = "openai";

export interface ImageSettings {
  provider: ImageProviderId;
  model: string;
  apiKey: string;
}

export function defaultImageSettings(): ImageSettings {
  return {
    provider: "openai",
    model: "gpt-image-1",
    apiKey: "",
  };
}

export interface BookMeta {
  title: string;
  subtitle: string;
  author: string;
  /** Data URL (base64) of the chosen cover image. */
  coverImageDataUrl: string;
}

export function defaultBookMeta(): BookMeta {
  return { title: "", subtitle: "", author: "", coverImageDataUrl: "" };
}

export interface RollingSummaryEntry {
  /**
   * Which chapter this summarises. Keyed by id, not position: positions
   * shift whenever a chapter is added or removed, so an entry keyed by
   * number silently starts describing a different chapter.
   */
  chapterId: string;
  chapterTitle: string;
  summary: string;
  createdAt: string;
}

export interface RollingSummary {
  enabled: boolean;
  entries: RollingSummaryEntry[];
}

export function defaultRollingSummary(): RollingSummary {
  return { enabled: true, entries: [] };
}

export interface StoryboardNote {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
}

export interface StoryboardStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

export interface StoryboardChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface Storyboard {
  notes: StoryboardNote[];
  strokes: StoryboardStroke[];
  chat: StoryboardChatMessage[];
}

export function emptyStoryboard(): Storyboard {
  return { notes: [], strokes: [], chat: [] };
}

export interface Project {
  id: string;
  /** Owner. Every query is scoped by this — see lib/repo/projects.ts. */
  userId: string;
  /** Internal / working project name (asked first, at creation). */
  name: string;
  createdAt: string;
  updatedAt: string;
  onboardingComplete: boolean;
  storyBible: StoryBible;
  chapters: Chapter[];
  aiSettings: AISettings;
  imageSettings: ImageSettings;
  book: BookMeta;
  rollingSummary: RollingSummary;
  storyboard: Storyboard;
}

/**
 * A project as the browser is allowed to see it: API keys replaced by a
 * boolean "is one configured?" flag. Secrets never cross to the client.
 */
export type ClientProject = Omit<Project, "aiSettings" | "imageSettings"> & {
  aiSettings: Omit<AISettings, "apiKeys"> & {
    configuredKeys: Partial<Record<AIProviderId, boolean>>;
  };
  imageSettings: Omit<ImageSettings, "apiKey"> & { hasApiKey: boolean };
};
