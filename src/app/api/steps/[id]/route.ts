import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { steps } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, any> = {};
    if (body.subject !== undefined) updates.subject = body.subject;
    if (body.bodyTemplate !== undefined) updates.bodyTemplate = body.bodyTemplate;
    if (body.delayDays !== undefined) updates.delayDays = body.delayDays;
    if (body.stepNumber !== undefined) updates.stepNumber = body.stepNumber;
    if (body.isReplyThread !== undefined) updates.isReplyThread = body.isReplyThread;
    if (body.ccRecipients !== undefined) updates.ccRecipients = body.ccRecipients;
    if (body.bccRecipients !== undefined) updates.bccRecipients = body.bccRecipients;
    if (body.abVariants !== undefined) updates.abVariants = body.abVariants;

    const [updated] = await db
      .update(steps)
      .set(updates)
      .where(eq(steps.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to update step" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    const [deleted] = await db
      .delete(steps)
      .where(eq(steps.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to delete step" }, { status: 500 });
  }
}
