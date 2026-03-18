import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webhookConfigs } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;

    const [deleted] = await db
      .delete(webhookConfigs)
      .where(
        and(
          eq(webhookConfigs.id, id),
          eq(webhookConfigs.workspaceId, workspaceId)
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to delete webhook" }, { status: 500 });
  }
}
