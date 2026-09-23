import { NextRequest, NextResponse } from "next/server";
import { toClientProject, saveBible } from "@/lib/repo/projects";
import { getProvider, resolveApiKey } from "@/lib/ai/providers";
import { extractBibleAnswers } from "@/lib/ai/extractBible";
import { findQuestion } from "@/lib/questionnaire";
import { AnswerValue, StoryBible } from "@/lib/types";
import { extractSchema } from "@/lib/validation";
import { ApiProblem, handle, notFound, parseBody, requireProject } from "@/lib/apiHelpers";

export const runtime = "nodejs";
export const maxDuration = 120;

function isEmpty(answer: AnswerValue | undefined): boolean {
  return !answer || (answer.selected.length === 0 && !answer.custom.trim());
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { userId, project } = await requireProject(ctx);
    const { text } = await parseBody(req, extractSchema);

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
        `No API key configured for ${provider.label}. Add one in Settings to use text import.`
      );
    }

    const extracted = await extractBibleAnswers(provider, { apiKey, model, text });

    // Work on a copy so a failure part-way through can't leave the stored
    // bible half-updated.
    const storyBible: StoryBible = JSON.parse(JSON.stringify(project.storyBible));
    let filledCount = 0;
    for (const [qid, value] of Object.entries(extracted)) {
      const question = findQuestion(qid);
      if (!question) continue;
      const section = storyBible[question.section];
      // Never clobber an answer the author already gave.
      if (!isEmpty(section.answers[qid])) continue;
      section.answers[qid] = value;
      filledCount++;
    }

    const updated = await saveBible(project.id, userId, storyBible);
    if (!updated) return notFound("Project not found.");
    return NextResponse.json({ project: toClientProject(updated), filledCount });
  });
}
