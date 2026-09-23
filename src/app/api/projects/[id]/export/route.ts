import { NextRequest, NextResponse } from "next/server";
import { handle, requireProject } from "@/lib/apiHelpers";

export const runtime = "nodejs";

/**
 * Exports the project as a portable `.inkshore.json` file — the format
 * accepted by POST /api/projects/import.
 *
 * API keys are stripped: an export is a file people email to a
 * collaborator or move between instances, and it must never carry
 * credentials along with it.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { project } = await requireProject(ctx, { withChapters: true });

    // userId is an internal ownership column; an export is a portable file
    // that gets re-owned by whoever imports it.
    const payload = {
      ...project,
      userId: undefined,
      aiSettings: { ...project.aiSettings, apiKeys: {} },
      imageSettings: { ...project.imageSettings, apiKey: "" },
      exportedAt: new Date().toISOString(),
      formatVersion: 2,
    };

    const filename = `${project.name.replace(/[^a-z0-9-_]+/gi, "_") || "project"}.inkshore.json`;
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });
}
