import { NextRequest, NextResponse } from "next/server";
import { getProvider, resolveApiKey } from "@/lib/ai/providers";
import { renderStoryBible } from "@/lib/ai/promptBuilder";
import { coverSuggestSchema } from "@/lib/validation";
import { ApiProblem, handle, parseBody, requireProject } from "@/lib/apiHelpers";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { project } = await requireProject(ctx);
    const { vision } = await parseBody(req, coverSuggestSchema);

    const provider = getProvider(project.aiSettings.provider);
    const model = project.aiSettings.model || provider.defaultModel;
    const apiKey = resolveApiKey(project.aiSettings.provider, project.aiSettings.apiKeys);
    if (!apiKey && ["claude-subscription", "codex-subscription"].includes(project.aiSettings.provider)) {
      throw new ApiProblem(
        400,
        "Subscription mode only works in the Inkshore desktop app using your local Claude or Codex sign-in. Pick a provider with an API key instead."
      );
    }
    if (!apiKey) {
      throw new ApiProblem(400, `No API key configured for ${provider.label}. Add one in Settings.`);
    }

    const bibleBrief = renderStoryBible(project.storyBible);
    const storySoFar = project.rollingSummary.entries
      .slice(-6)
      .map((e) => `${e.chapterTitle}: ${e.summary}`)
      .join("\n");

    const system = `You art-direct novel covers. Given a story bible and the story so far, propose exactly 3 distinct cover art directions. Each should be a single vivid, concrete paragraph written as a ready-to-use image-generation prompt: composition, subject, mood, palette, lighting, style. No titles, no numbering labels beyond order, no commentary — just the 3 prompts, separated by a line of "---".`;
    const user = `STORY BIBLE\n${bibleBrief || "(sparse)"}\n\nSTORY SO FAR\n${
      storySoFar || "(no chapters yet)"
    }\n\nAUTHOR'S VISION FOR THE COVER\n${
      vision?.trim() || "(no specific vision given — use your judgment)"
    }\n\nGive 3 cover art directions now.`;

    let full = "";
    await provider.generateChapter({
      apiKey,
      model,
      systemPrompt: system,
      userPrompt: user,
      maxTokens: 1200,
      onChunk: (chunk) => {
        full += chunk;
      },
    });

    const directions = full
      .split(/\n?---\n?/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);

    return NextResponse.json({ directions });
  });
}
