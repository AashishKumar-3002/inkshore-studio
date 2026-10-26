import { NextRequest, NextResponse } from "next/server";
import { handle, parseBody, requireChapterContext } from "@/lib/apiHelpers";
import { saveChapterVersionSchema } from "@/lib/chapterAssistant";
import { saveChapterVersion } from "@/lib/repo/chapterAssistant";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; chapterId: string }> }) {
  return handle(async () => {
    const { project, chapterId, userId } = await requireChapterContext(ctx);
    const input = await parseBody(req, saveChapterVersionSchema);
    return NextResponse.json(await saveChapterVersion(project.id, chapterId, userId, input.expectedContent, input.label), { status: 201 });
  });
}
