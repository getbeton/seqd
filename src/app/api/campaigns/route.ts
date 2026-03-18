import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, enrollments, plannedSends } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, sql } from "drizzle-orm";

export async function GET() {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();

    const result = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.workspaceId, workspaceId))
      .orderBy(campaigns.createdAt);

    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const body = await request.json();

    const [campaign] = await db
      .insert(campaigns)
      .values({
        workspaceId,
        name: body.name,
        sendingWindowStart: body.sendingWindowStart || "08:00",
        sendingWindowEnd: body.sendingWindowEnd || "18:00",
        timezone: body.timezone || "UTC",
        skipWeekends: body.skipWeekends ?? true,
        excludedContactStageIds: body.excludedContactStageIds || [],
        eventToStageMapping: body.eventToStageMapping || {},
      })
      .returning();

    return NextResponse.json(campaign, { status: 201 });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create campaign error:", error);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
