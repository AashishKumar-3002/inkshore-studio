import { NextRequest, NextResponse } from "next/server";
import { getChapter } from "@/lib/repo/projects";
import { getProvider, resolveApiKey } from "@/lib/ai/providers";
import { ApiProblem, handle, notFound, requireChapterContext } from "@/lib/apiHelpers";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; chapterId: string }> }
) {
  return handle(async () => {
    const { userId, project, chapterId } = await requireChapterContext(ctx);
    const found = await getChapter(project.id, chapterId, userId);
    if (!found) return notFound("Chapter not found.");
    const { chapter } = found;

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
      throw new ApiProblem(
        400,
        `No API key configured for ${provider.label}. Add one in Settings.`
      );
    }

    const basis = chapter.content?.trim() || chapter.idea?.trim();
    if (!basis) {
      throw new ApiProblem(400, "This chapter has no content or idea yet to name it from.");
    }

    const system =
      "You title novel chapters. Given the chapter's text or premise, return ONE short, evocative chapter title (2-6 words). No quotes, no 'Chapter N', no explanation — just the title text.";
    const user = `Chapter content or idea:\n\n${basis.slice(0, 6000)}\n\nGive one chapter title.`;

    let full = "";
    await provider.generateChapter({
      apiKey,
      model,
      systemPrompt: system,
      userPrompt: user,
      maxTokens: 40,
      onChunk: (chunk) => {
        full += chunk;
      },
    });

    const title = full.trim().replace(/^["'“]|["'”]$/g, "").split("\n")[0].slice(0, 80);
    return NextResponse.json({ title: title || `Chapter ${chapter.index}` });
  });
}
