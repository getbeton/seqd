/**
 * @deprecated Experiments are now unified with campaigns.
 * This route proxies to /api/campaigns for backwards compatibility.
 * Use /api/campaigns with type='custom' instead.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, sequences } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, sql, count, and } from "drizzle-orm";

export async function GET() {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();

    const rows = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        description: campaigns.description,
        status: campaigns.status,
        type: campaigns.type,
        hypothesis: campaigns.hypothesis,
        createdAt: campaigns.createdAt,
        sequenceCount: count(sequences.id),
        activeCount: sql<number>`count(case when ${sequences.status} = 'active' then 1 end)::int`,
        repliedCount: sql<number>`count(case when ${sequences.finishedReason} = 'replied' then 1 end)::int`,
      })
      .from(campaigns)
      .leftJoin(sequences, eq(sequences.campaignId, campaigns.id))
      .where(and(eq(campaigns.workspaceId, workspaceId), eq(campaigns.type, "custom")))
      .groupBy(campaigns.id)
      .orderBy(campaigns.createdAt);

    return NextResponse.json(rows);
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch experiments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const body = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const [campaign] = await db
      .insert(campaigns)
      .values({
        workspaceId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        hypothesis: body.hypothesis?.trim() || null,
        status: "active",
        type: "custom",
      })
      .returning();

    return NextResponse.json(campaign, { status: 201 });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to create experiment" }, { status: 500 });
  }
}
