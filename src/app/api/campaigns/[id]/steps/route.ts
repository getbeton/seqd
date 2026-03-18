import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { steps, campaigns } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    const result = await db
      .select()
      .from(steps)
      .where(eq(steps.campaignId, id))
      .orderBy(steps.stepNumber);

    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch steps" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = await request.json();

    // Get next step number
    const existing = await db
      .select()
      .from(steps)
      .where(eq(steps.campaignId, id))
      .orderBy(steps.stepNumber);

    const nextStepNumber =
      existing.length > 0
        ? Math.max(...existing.map((s) => s.stepNumber)) + 1
        : 1;

    const [step] = await db
      .insert(steps)
      .values({
        campaignId: id,
        stepNumber: body.stepNumber || nextStepNumber,
        stepType: body.stepType || "email",
        subject: body.subject,
        bodyTemplate: body.bodyTemplate,
        delayDays: body.delayDays ?? 0,
        isReplyThread: body.isReplyThread ?? true,
        ccRecipients: body.ccRecipients || [],
        bccRecipients: body.bccRecipients || [],
      })
      .returning();

    return NextResponse.json(step, { status: 201 });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create step error:", error);
    return NextResponse.json({ error: "Failed to create step" }, { status: 500 });
  }
}
