import { NextRequest, NextResponse } from "next/server";
import { handle, parseBody, requireProject } from "@/lib/apiHelpers";
import { buildPreviews, masterCommandDismissSchema, masterCommandRequestSchema } from "@/lib/masterCommand";
import { runMasterCommand } from "@/lib/ai/masterCommand";
import { commandRunHistory, dismissCommandRun, saveCommandRun } from "@/lib/repo/masterCommand";

export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { project, userId } = await requireProject(ctx);
    return NextResponse.json(await commandRunHistory(project.id, userId));
  });
}

export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { project, userId } = await requireProject(ctx, { withChapters: true });
    const input = await parseBody(req, masterCommandRequestSchema);
    const { transcript, response } = await runMasterCommand(project, input, req.signal);
    // A run is only persisted once the author is still there to see it: an
    // aborted request must not leave a proposal they never read.
    req.signal.throwIfAborted();
    const previews = buildPreviews(response.actions, project);
    return NextResponse.json(await saveCommandRun(project.id, userId, transcript, { ...response, previews }));
  });
}

export async function DELETE(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { project, userId } = await requireProject(ctx);
    const { runId } = await parseBody(req, masterCommandDismissSchema);
    await dismissCommandRun(project.id, userId, runId);
    return NextResponse.json({ ok: true });
  });
}
