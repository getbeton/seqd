import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)));

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json(campaign);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch campaign" }, { status: 500 });
  }
}

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
    if (body.name !== undefined) updates.name = body.name;
    if (body.sendingWindowStart !== undefined) updates.sendingWindowStart = body.sendingWindowStart;
    if (body.sendingWindowEnd !== undefined) updates.sendingWindowEnd = body.sendingWindowEnd;
    if (body.timezone !== undefined) updates.timezone = body.timezone;
    if (body.skipWeekends !== undefined) updates.skipWeekends = body.skipWeekends;
    if (body.excludedContactStageIds !== undefined) updates.excludedContactStageIds = body.excludedContactStageIds;
    if (body.eventToStageMapping !== undefined) updates.eventToStageMapping = body.eventToStageMapping;

    const [updated] = await db
      .update(campaigns)
      .set(updates)
      .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }
}
