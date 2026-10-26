import { z } from "zod";

export const ASSISTANT_ACTIONS = ["ask", "rewrite", "analyze", "humanize"] as const;
export type AssistantAction = typeof ASSISTANT_ACTIONS[number];
export type TextSelection = { start: number; end: number };
export const SCORE_CATEGORIES = {
  engagement: "Reader engagement",
  character: "Character & dialogue",
  structure: "Structure & pacing",
  prose: "Prose & voice",
  coherence: "Coherence & payoff",
} as const;
const assessment = z.object({ score: z.number().int().min(0).max(100), explanation: z.string().min(1).max(4000) });
const evidence = z.object({ quote: z.string().min(1).max(2000), comment: z.string().min(1).max(4000) });
export const analysisSchema = z.object({
  assessment: z.string().min(1).max(5000),
  categories: z.object({ engagement: assessment, character: assessment, structure: assessment, prose: assessment, coherence: assessment }),
  strengths: z.array(evidence).min(1).max(5),
  improvements: z.array(z.object({ quote: z.string().min(1).max(2000), issue: z.string().min(1).max(4000), suggestion: z.string().min(1).max(4000) })).min(1).max(3),
});
export type ChapterAnalysis = z.infer<typeof analysisSchema> & { overall: number };
export type AssistantPayload = { action: AssistantAction; instruction?: string; label?: string; strength?: "light" | "balanced" | "substantial"; focus?: ("dialogue" | "rhythm" | "repetition" | "specificity")[]; selection?: TextSelection; answer?: string; replacement?: string; analysis?: ChapterAnalysis; appliedContent?: string; appliedChanges?: number[] };
export type AssistantEntry = { id: string; chapterId: string; kind: "result" | "version"; sourceContent: string; payload: AssistantPayload; createdAt: string };
export const assistantRequestSchema = z.object({
  action: z.enum(ASSISTANT_ACTIONS),
  content: z.string().min(1, "Write or paste a chapter first.").max(200_000, "This chapter is too long for a single assistant request."),
  selection: z.object({ start: z.number().int().min(0), end: z.number().int().min(1) }).optional(),
  instruction: z.string().trim().max(5000).default(""),
  strength: z.enum(["light", "balanced", "substantial"]).default("light"),
  focus: z.array(z.enum(["dialogue", "rhythm", "repetition", "specificity"])).max(4).default([]),
}).superRefine((value, ctx) => {
  if (!value.content.trim()) ctx.addIssue({ code: "custom", message: "Write or paste a chapter first.", path: ["content"] });
  if (value.selection && (value.selection.start >= value.selection.end || value.selection.end > value.content.length)) ctx.addIssue({ code: "custom", message: "Select a valid passage again.", path: ["selection"] });
  if ((value.action === "ask" || value.action === "rewrite") && !value.instruction) ctx.addIssue({ code: "custom", message: "Tell the assistant what you want.", path: ["instruction"] });
  if (value.action === "analyze" && value.selection) ctx.addIssue({ code: "custom", message: "Analysis evaluates the whole chapter.", path: ["selection"] });
});
export type AssistantRequest = z.input<typeof assistantRequestSchema>;
export const assistantApplySchema = z.object({ entryId: z.string().min(1).max(100), expectedContent: z.string().max(2_000_000), acceptedChanges: z.array(z.number().int().min(0)).max(1000).optional() });
export const saveChapterVersionSchema = z.object({ expectedContent: z.string().max(2_000_000), label: z.string().trim().max(80).default("") });

/** Match typography/whitespace differences, then return the actual source excerpt. */
export function resolveEvidenceQuote(quote: string, source: string): string | null {
  if (source.includes(quote)) return quote;
  const normalize = (text: string) => {
    let value = "";
    const starts: number[] = [], ends: number[] = [];
    for (let i = 0; i < text.length; i++) {
      let part = text[i].replace(/[‘’]/g, "'").replace(/[“”]/g, '\"').replace(/…/g, "...");
      if (/\s/.test(part)) part = " ";
      if (part === " " && value.endsWith(" ")) { ends[ends.length - 1] = i + 1; continue; }
      for (const character of part) { value += character; starts.push(i); ends.push(i + 1); }
    }
    return { value, starts, ends };
  };
  const normalized = normalize(source), needle = normalize(quote).value.trim();
  if (!needle) return null;
  const offset = normalized.value.indexOf(needle);
  return offset < 0 ? null : source.slice(normalized.starts[offset], normalized.ends[offset + needle.length - 1]);
}

export function parseChapterAnalysis(text: string, source: string): ChapterAnalysis {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const parsed = analysisSchema.parse(JSON.parse(cleaned));
  for (const item of [...parsed.strengths, ...parsed.improvements]) {
    const actual = resolveEvidenceQuote(item.quote, source);
    if (!actual) throw new Error("The analysis quoted a passage that is not in this chapter.");
    item.quote = actual;
  }
  const overall = Math.round(Object.values(parsed.categories).reduce((sum, value) => sum + value.score, 0) / 5);
  return { ...parsed, overall };
}

export type TextChange = { start: number; end: number; before: string; after: string };
/** Paragraph-level comparison retains exact whitespace and stable source offsets. */
export function comparePassages(before: string, after: string): TextChange[] {
  if (before === after) return [];
  const split = (text: string) => text.match(/[^\n]*(?:\n+|$)/g)?.filter(Boolean) ?? [];
  const a = split(before), b = split(after);
  if (a.length > 500 || b.length > 500) return [{ start: 0, end: before.length, before, after }];
  const matrix = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) matrix[i][j] = a[i] === b[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
  let i = 0, j = 0, offset = 0;
  const changes: TextChange[] = [];
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { offset += a[i++].length; j++; continue; }
    const start = offset;
    let oldText = "", newText = "";
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) break;
      if (j < b.length && (i === a.length || matrix[i][j + 1] >= matrix[i + 1][j])) newText += b[j++];
      else { oldText += a[i]; offset += a[i++].length; }
    }
    const oldParts = split(oldText), newParts = split(newText);
    if (oldParts.length > 1 && oldParts.length === newParts.length) {
      let partOffset = start;
      oldParts.forEach((part, index) => {
        if (part !== newParts[index]) changes.push({ start: partOffset, end: partOffset + part.length, before: part, after: newParts[index] });
        partOffset += part.length;
      });
    } else changes.push({ start, end: offset, before: oldText, after: newText });
  }
  return changes;
}
export function applyPassageChanges(source: string, replacement: string, accepted?: number[]): string {
  const changes = comparePassages(source, replacement);
  const indexes = accepted ?? changes.map((_, index) => index);
  if (new Set(indexes).size !== indexes.length || indexes.some(index => !Number.isInteger(index) || index >= changes.length || index < 0)) throw new Error("Invalid passage choices.");
  let result = source;
  for (const index of [...indexes].sort((a, b) => b - a)) {
    const change = changes[index];
    result = result.slice(0, change.start) + change.after + result.slice(change.end);
  }
  return result;
}
