import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { templates, templateSteps } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, count } from "drizzle-orm";

export async function GET() {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();

    const rows = await db
      .select({
        template: templates,
        stepCount: count(templateSteps.id),
      })
      .from(templates)
      .leftJoin(templateSteps, eq(templateSteps.templateId, templates.id))
      .where(eq(templates.workspaceId, workspaceId))
      .groupBy(templates.id)
      .orderBy(templates.createdAt);

    return NextResponse.json(rows.map(({ template, stepCount }) => ({
      ...template,
      stepCount,
    })));
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const [template] = await db
      .insert(templates)
      .values({
        workspaceId,
        name: body.name,
        description: body.description ?? null,
        sendingWindowStart: body.sending_window_start ?? "08:00",
        sendingWindowEnd: body.sending_window_end ?? "18:00",
        timezone: body.timezone ?? "UTC",
        skipWeekends: body.skip_weekends ?? true,
      })
      .returning();

    return NextResponse.json(template, { status: 201 });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create template error:", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
