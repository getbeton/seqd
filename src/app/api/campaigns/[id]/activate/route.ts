import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, steps } from "@/lib/db/schema";
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

    // Verify campaign has at least one step
    const campaignSteps = await db
      .select()
      .from(steps)
      .where(eq(steps.campaignId, id));

    if (campaignSteps.length === 0) {
      return NextResponse.json(
        { error: "Campaign must have at least one step before activation" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(campaigns)
      .set({ status: "active" })
      .where(
        and(
          eq(campaigns.id, id),
          eq(campaigns.workspaceId, workspaceId),
          eq(campaigns.status, "draft")
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Campaign not found or not in draft status" },
        { status: 404 }
      );
    }
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to activate campaign" }, { status: 500 });
  }
}
