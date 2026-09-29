/**
 * Master command — shared schema and pure logic.
 *
 * The planner returns a *proposal*, never a write. Everything the model can
 * ask for is enumerated here as a closed union, so the only thing that ever
 * crosses into the repo layer is a value this file has already validated.
 */
import { z } from "zod";
import { SECTION_IDS, type Project, type SectionId } from "./types";
import { SECTION_META } from "./questionnaire";

export const MASTER_INTENTS = ["answer", "plan_chapters", "update_bible"] as const;
export type MasterIntent = typeof MASTER_INTENTS[number];

export const MAX_PLANNED_CHAPTERS = 20;

const plannedChapterSchema = z.object({
  title: z.string().min(1).max(200),
  idea: z.string().min(1).max(5000),
});
export type PlannedChapter = z.infer<typeof plannedChapterSchema>;

export const masterActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("plan_chapters"), chapters: z.array(plannedChapterSchema).min(1).max(MAX_PLANNED_CHAPTERS) }),
  z.object({ type: z.literal("update_bible"), sectionId: z.enum(SECTION_IDS), notes: z.string().min(1).max(20000) }),
]);
export type MasterAction = z.infer<typeof masterActionSchema>;

export const masterCommandResponseSchema = z.object({
  reply: z.string().min(1).max(20000),
  intent: z.enum(MASTER_INTENTS),
  actions: z.array(masterActionSchema).max(5),
});
export type MasterCommandResponse = z.infer<typeof masterCommandResponseSchema>;

/** A proposed write in the author's language — what the drawer renders. */
export type ActionPreview = { title: string; detail: string; before?: string; after?: string };
export type MasterCommandPayload = MasterCommandResponse & { previews: ActionPreview[] };
export type MasterCommandStatus = "proposed" | "applied" | "dismissed";
export type MasterCommandRun = {
  id: string;
  status: MasterCommandStatus;
  transcript: string;
  payload: MasterCommandPayload;
  appliedAt: string | null;
  createdAt: string;
};

export const masterCommandRequestSchema = z.object({
  transcript: z.string().trim().min(1, "Say or type what you want first.").max(5000),
});
export type MasterCommandRequest = z.input<typeof masterCommandRequestSchema>;

export const masterCommandApplySchema = z.object({
  runId: z.string().min(1).max(100),
  /** Minted once per run by the client, so a retried confirm cannot create a second set of chapters. */
  idempotencyKey: z.string().min(8).max(100),
});

export const masterCommandDismissSchema = z.object({ runId: z.string().min(1).max(100) });

/**
 * Structured-output schema for providers that enforce one (Codex). OpenAI's
 * strict mode understands `anyOf` but not `oneOf`, which is what Zod emits
 * for a discriminated union — the rewrite is the whole difference.
 */
export function masterCommandJsonSchema(): Record<string, unknown> {
  const rewrite = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(rewrite);
    if (!node || typeof node !== "object") return node;
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key === "oneOf" ? "anyOf" : key, rewrite(value)]));
  };
  return rewrite(z.toJSONSchema(masterCommandResponseSchema)) as Record<string, unknown>;
}

/** Notes are appended, never replaced — the author's own words survive every proposal. */
export function appendBibleNotes(existing: string, addition: string): string {
  return [existing.trim(), addition.trim()].filter(Boolean).join("\n\n");
}

export function sectionLabel(sectionId: SectionId): string {
  return SECTION_META[sectionId].label;
}

/** True for anything that writes. Computed here, never read from the model. */
export function needsConfirmation(payload: Pick<MasterCommandPayload, "actions">): boolean {
  return payload.actions.length > 0;
}

export function buildPreviews(actions: MasterAction[], project: Pick<Project, "storyBible" | "chapters">): ActionPreview[] {
  return actions.map(action => {
    if (action.type === "plan_chapters") {
      const next = project.chapters.length + 1;
      return {
        title: `Add ${action.chapters.length} chapter${action.chapters.length === 1 ? "" : "s"} after your current ${project.chapters.length}`,
        detail: action.chapters.map((chapter, index) => `${next + index}. ${chapter.title} — ${chapter.idea}`).join("\n"),
      };
    }
    const before = project.storyBible[action.sectionId]?.notes ?? "";
    return {
      title: `Add a note to Story Bible → ${sectionLabel(action.sectionId)}`,
      detail: action.notes,
      before,
      after: appendBibleNotes(before, action.notes),
    };
  });
}

/**
 * Validates one planner response. A reply that claims an intent its actions
 * don't match is a failure, not something to reconcile silently: the author
 * reads the reply and confirms the actions, so the two disagreeing is exactly
 * the case where they'd approve something they didn't read.
 */
export function parseMasterCommand(text: string): MasterCommandResponse {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const parsed = masterCommandResponseSchema.parse(JSON.parse(cleaned));
  if (parsed.intent === "answer" && parsed.actions.length) throw new Error("An answer must not propose actions.");
  if (parsed.intent !== "answer" && !parsed.actions.length) throw new Error(`Intent ${parsed.intent} requires a matching action.`);
  const expected = parsed.intent === "plan_chapters" ? "plan_chapters" : "update_bible";
  if (parsed.actions.some(action => action.type !== expected)) throw new Error(`Intent ${parsed.intent} allows only ${expected} actions.`);
  return parsed;
}
