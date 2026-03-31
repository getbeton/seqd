/**
 * @deprecated Experiments are now unified with campaigns.
 * This route proxies to /api/campaigns/[id] for backwards compatibility.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, sequences } from "@/lib/db/schema";
import { requireSession, getWorkspaceId } from "@/lib/auth/session";
import { eq, and, count, sql } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;

    const [row] = await db
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
      .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)))
      .groupBy(campaigns.id);

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to fetch experiment" }, { status: 500 });
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

    const updates: Record<string, unknown> = {};
    if (body.name) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.hypothesis !== undefined) updates.hypothesis = body.hypothesis?.trim() || null;
    if (body.status) updates.status = body.status;

    const [updated] = await db
      .update(campaigns)
      .set(updates)
      .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)))
      .returning();

    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to update experiment" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const workspaceId = await getWorkspaceId();
    const { id } = await params;

    await db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)));
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to delete experiment" }, { status: 500 });
  }
}
