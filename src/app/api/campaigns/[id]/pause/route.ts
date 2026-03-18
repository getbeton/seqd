import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, enrollments, plannedSends } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, inArray } from "drizzle-orm";

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
      .set({ status: "paused" })
      .where(
        and(
          eq(campaigns.id, id),
          eq(campaigns.workspaceId, workspaceId),
          eq(campaigns.status, "active")
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Campaign not found or not active" }, { status: 404 });
    }

    // Get active enrollments for this campaign
    const activeEnrollments = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.campaignId, id), eq(enrollments.status, "active")));

    if (activeEnrollments.length > 0) {
      const enrollmentIds = activeEnrollments.map((e) => e.id);

      // Pause enrollments
      await db
        .update(enrollments)
        .set({ status: "paused", pausedReason: "campaign_paused", pausedAt: new Date() })
        .where(inArray(enrollments.id, enrollmentIds));

      // Cancel their pending sends
      await db
        .update(plannedSends)
        .set({ status: "cancelled" })
        .where(
          and(
            inArray(plannedSends.enrollmentId, enrollmentIds),
            eq(plannedSends.status, "pending")
          )
        );
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to pause campaign" }, { status: 500 });
  }
}
