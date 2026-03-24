import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { templates, templateSteps } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, asc, count } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;

    // Verify template belongs to workspace
    const [template] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.workspaceId, workspaceId)));

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const steps = await db
      .select()
      .from(templateSteps)
      .where(eq(templateSteps.templateId, id))
      .orderBy(asc(templateSteps.stepNumber));

    return NextResponse.json(steps);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch template steps" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;
    const body = await request.json();

    // Verify template belongs to workspace
    const [template] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.workspaceId, workspaceId)));

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Auto-assign step number if not provided
    let stepNumber = body.step_number;
    if (stepNumber === undefined) {
      const [result] = await db
        .select({ total: count() })
        .from(templateSteps)
        .where(eq(templateSteps.templateId, id));
      stepNumber = (result?.total ?? 0) + 1;
    }

    const [step] = await db
      .insert(templateSteps)
      .values({
        templateId: id,
        stepNumber,
        subject: body.subject ?? null,
        bodyTemplate: body.body_template ?? null,
        delayDays: body.delay_days ?? 0,
        isReplyThread: body.is_reply_thread ?? true,
        ccRecipients: body.cc_recipients ?? [],
        bccRecipients: body.bcc_recipients ?? [],
      })
      .returning();

    return NextResponse.json(step, { status: 201 });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create template step error:", error);
    return NextResponse.json({ error: "Failed to create template step" }, { status: 500 });
  }
}
