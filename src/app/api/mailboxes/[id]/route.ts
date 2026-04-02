import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mailboxes, sequenceSteps } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, count } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, any> = {};
    if (body.dailyLimit !== undefined) updates.dailyLimit = body.dailyLimit;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.displayName !== undefined) updates.displayName = body.displayName;

    const [updated] = await db
      .update(mailboxes)
      .set(updates)
      .where(and(eq(mailboxes.id, id), eq(mailboxes.workspaceId, workspaceId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to update mailbox" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;

    // Count pending steps for this mailbox
    const [pendingCount] = await db
      .select({ count: count() })
      .from(sequenceSteps)
      .where(
        and(eq(sequenceSteps.mailboxId, id), eq(sequenceSteps.status, "pending"))
      );

    // Cancel them
    if (pendingCount.count > 0) {
      await db
        .update(sequenceSteps)
        .set({ status: "cancelled" })
        .where(
          and(eq(sequenceSteps.mailboxId, id), eq(sequenceSteps.status, "pending"))
        );
    }

    const [deleted] = await db
      .delete(mailboxes)
      .where(and(eq(mailboxes.id, id), eq(mailboxes.workspaceId, workspaceId)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, cancelledSteps: pendingCount.count });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to delete mailbox" }, { status: 500 });
  }
}
