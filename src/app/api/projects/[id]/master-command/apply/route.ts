import { NextRequest, NextResponse } from "next/server";
import { handle, parseBody, requireProject } from "@/lib/apiHelpers";
import { masterCommandApplySchema } from "@/lib/masterCommand";
import { applyCommandRun } from "@/lib/repo/masterCommand";

export const runtime = "nodejs";

/** The only path from a proposal to a write, and it needs an explicit run id. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { project, userId } = await requireProject(ctx);
    const { runId, idempotencyKey } = await parseBody(req, masterCommandApplySchema);
    return NextResponse.json(await applyCommandRun(project.id, userId, runId, idempotencyKey));
  });
}
