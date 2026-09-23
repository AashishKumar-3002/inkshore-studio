import { NextRequest, NextResponse } from "next/server";
import { importProject, toClientProject } from "@/lib/repo/projects";
import { importProjectSchema } from "@/lib/validation";
import { ApiProblem, handle, parseBody, requireUserId } from "@/lib/apiHelpers";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Imports a project from an `.inkshore.json` file. The payload remains
 * compatible with pre-rebrand `.inkdrop.json` exports. Import always creates
 * a new project and never adopts credentials from the file.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId();
    const body = await parseBody(req, importProjectSchema);

    if (!body.storyBible || typeof body.storyBible !== "object") {
      throw new ApiProblem(400, "This doesn't look like an Inkshore project export.");
    }

    const project = await importProject(
      userId,
      body as unknown as Partial<Project>,
      body.__importName
    );
    return NextResponse.json(toClientProject(project), { status: 201 });
  });
}
