import { NextRequest, NextResponse } from "next/server";
import { updateProject } from "@/lib/repo/projects";
import { getProvider, modelSupportsVision, resolveApiKey } from "@/lib/ai/providers";
import { renderStoryBible } from "@/lib/ai/promptBuilder";
import { storyboardAskSchema } from "@/lib/validation";
import { ApiProblem, handle, parseBody, requireProject } from "@/lib/apiHelpers";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { userId, project } = await requireProject(ctx);
    const { question, canvasImageDataUrl } = await parseBody(req, storyboardAskSchema);

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

    const notesText = project.storyboard.notes
      .filter((n) => n.text.trim())
      .map((n) => `- ${n.text.trim()}`)
      .join("\n");
    // Only send the sketch if there is one AND the chosen model can see it,
    // otherwise the request just errors out at the provider.
    const canSee = modelSupportsVision(project.aiSettings.provider, model);
    const sketch =
      project.storyboard.strokes.length > 0 && canvasImageDataUrl && canSee
        ? canvasImageDataUrl
        : undefined;

    const bibleBrief = renderStoryBible(project.storyBible);
    const storySoFar = project.rollingSummary.entries
      .slice(-8)
      .map((e) => `${e.chapterTitle}: ${e.summary}`)
      .join("\n");

    const system = `You are a sharp, honest developmental editor helping an author think through their novel on a storyboard/corkboard. Be concrete and specific — reference their actual characters, threads, and notes. Point out gaps, contradictions, or missed opportunities when relevant. Keep answers focused (a few short paragraphs or a tight list), never generic writing-advice filler.`;

    const user = `STORY BIBLE\n${bibleBrief || "(sparse)"}\n\nSTORY SO FAR\n${
      storySoFar || "(no chapters yet)"
    }\n\nSTICKY NOTES ON THE STORYBOARD\n${notesText || "(no text notes)"}\n${
      sketch
        ? "\nThe author has also sketched something on the canvas — an image of it is attached; take it into account.\n"
        : ""
    }\nAUTHOR'S QUESTION\n${question}`;

    let full = "";
    await provider.generateChapter({
      apiKey,
      model,
      systemPrompt: system,
      userPrompt: user,
      imageDataUrl: sketch,
      maxTokens: 2000,
      onChunk: (chunk) => {
        full += chunk;
      },
    });

    const now = new Date().toISOString();
    const chat = [
      ...project.storyboard.chat,
      { role: "user" as const, content: question, createdAt: now },
      { role: "assistant" as const, content: full.trim(), createdAt: new Date().toISOString() },
    ];
    await updateProject(project.id, userId, {
      storyboard: { ...project.storyboard, chat },
    });

    return NextResponse.json({ answer: full.trim(), chat });
  });
}
