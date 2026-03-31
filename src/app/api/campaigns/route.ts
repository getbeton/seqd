import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, sequences } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, count, sql } from "drizzle-orm";

export async function GET() {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();

    const rows = await db
      .select({
        campaign: campaigns,
        sequenceCount: count(sequences.id),
      })
      .from(campaigns)
      .leftJoin(sequences, eq(sequences.campaignId, campaigns.id))
      .where(eq(campaigns.workspaceId, workspaceId))
      .groupBy(campaigns.id)
      .orderBy(campaigns.createdAt);

    return NextResponse.json(rows.map(({ campaign, sequenceCount }) => ({
      ...campaign,
      sequenceCount,
    })));
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

    const validTypes = ["template", "custom"];
    const type = body.type && validTypes.includes(body.type) ? body.type : "custom";

    const [campaign] = await db
      .insert(campaigns)
      .values({
        workspaceId,
        name: body.name,
        description: body.description ?? null,
        type,
        hypothesis: body.hypothesis ?? null,
        status: "active",
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
