import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, enrollments } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;

    const [updated] = await db
      .update(campaigns)
      .set({ status: "active" })
      .where(
        and(
          eq(campaigns.id, id),
          eq(campaigns.workspaceId, workspaceId),
          eq(campaigns.status, "paused")
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Campaign not found or not paused" }, { status: 404 });
    }

    // Resume enrollments that were paused due to campaign pause
    // Note: re-enrollment (slot reservation) will be handled separately
    await db
      .update(enrollments)
      .set({ status: "active", pausedReason: null, pausedAt: null })
      .where(
        and(
          eq(enrollments.campaignId, id),
          eq(enrollments.status, "paused"),
          eq(enrollments.pausedReason, "campaign_paused")
        )
      );

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to resume campaign" }, { status: 500 });
  }
}
